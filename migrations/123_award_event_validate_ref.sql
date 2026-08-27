-- ============================================================
-- Migration 123 — `award_event` n'attribuait rien de vérifié
-- ============================================================
-- `award_event('message_posted', p_ref)` accorde 5 XP et 1 pièce, plafonné à
-- 50 par jour. La fonction exigeait seulement que `p_ref` soit non vide :
-- aucune vérification que cette référence désigne un vrai message, ni qu'il
-- ait été écrit par l'appelant. Deux conséquences.
--
-- 1. **Récompense sans contrepartie.** N'importe quelle chaîne faisait
--    l'affaire : 50 appels avec des valeurs arbitraires rapportaient le
--    maximum quotidien (250 XP, 50 pièces) sans écrire une ligne.
--
-- 2. **Nuisance, plus gênante.** L'index d'unicité qui empêche de toucher
--    deux fois la même récompense est
--
--      gamif_msg_unique (event_type, ref_id) WHERE event_type='message_posted'
--
--    — global, pas par utilisateur. Or `chat_messages.id` est un `bigint`
--    séquentiel, donc prévisible. En réservant à l'avance les identifiants à
--    venir, on privait les auteurs légitimes de leur récompense : leur propre
--    appel se heurtait à la contrainte et repartait sans rien.
--
-- Relevé avant correction, sur 736 événements `message_posted` : 0 référence
-- appartenant à un autre auteur, 0 correspondant à un message privé. La faille
-- n'a jamais été exploitée. Les 82 références sans message correspondant sont
-- des messages supprimés APRÈS l'attribution — ce que le contrôle ci-dessous
-- n'empêche pas, puisqu'il ne s'applique qu'au moment de l'appel.
--
-- Le reste de la fonction est inchangé. `daily_login` n'avait pas ce défaut :
-- `gamif_daily_unique (user_id, event_type, created_day)` le borne bien à une
-- attribution par jour et par compte.

CREATE OR REPLACE FUNCTION public.award_event(
  p_event text,
  p_ref text DEFAULT NULL::text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(new_xp integer, new_coins integer, level integer,
              streak_current integer, awarded boolean, event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_xp int := 0;
  v_coins int := 0;
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_bal gamification_balances%rowtype;
  v_awarded boolean := false;          -- récompense de l'événement principal
  v_event_id uuid;
  v_count_today int;
  v_streak_awarded boolean := false;   -- incrément de streak accordé aujourd'hui ?
  v_streak_event_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into gamification_balances (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  -- -------- RÈGLES --------
  if p_event = 'message_posted' then
    if p_ref is null or length(p_ref) = 0 then
      raise exception 'ref_id required for message_posted';
    end if;

    -- La référence doit désigner un message réel, écrit par l'appelant.
    -- Sans ce contrôle, n'importe quelle chaîne était acceptée : récompense
    -- sans écrire, et surtout réservation d'identifiants à venir qui privait
    -- leurs auteurs légitimes de la leur (l'index d'unicité est global sur
    -- `ref_id`, pas par utilisateur).
    if p_ref !~ '^[0-9]+$' then
      raise exception 'ref_id invalide';
    end if;

    if not exists (
      select 1 from public.chat_messages m
      where m.id = p_ref::bigint
        and m.author_id = v_uid
    ) then
      raise exception 'ref_id inconnu ou non attribuable';
    end if;

    -- Anti-spam: max 50 messages récompensés / jour
    select count(*) into v_count_today
    from gamification_events
    where user_id = v_uid
      and event_type = 'message_posted'
      and created_day = v_today;

    if v_count_today < 50 then
      v_xp := 5;
      v_coins := 1;
    else
      v_xp := 0;
      v_coins := 0;
    end if;

  elsif p_event = 'daily_login' then
    -- Le login peut encore donner un bonus, mais NE TOUCHE PLUS à la streak
    v_xp := 20;
    v_coins := 5;

  else
    raise exception 'unsupported event: %', p_event;
  end if;

  -- -------- ENREGISTREMENT DE L'ÉVÉNEMENT PRINCIPAL --------
  if v_xp > 0 or v_coins > 0 then
    begin
      insert into gamification_events(user_id, event_type, ref_id, meta, xp, coins)
      values (v_uid, p_event, p_ref, coalesce(p_meta,'{}'::jsonb), v_xp, v_coins)
      returning id into v_event_id;
      v_awarded := true;
    exception when unique_violation then
      v_awarded := false;
    end;
  end if;

  -- Met à jour XP/coins si attribués
  if v_awarded then
    update gamification_balances b
    set xp = b.xp + v_xp,
        coins = b.coins + v_coins
    where b.user_id = v_uid
    returning * into v_bal;
  else
    select * into v_bal from gamification_balances where user_id = v_uid;
  end if;

  -- -------- STREAK BASÉE SUR LE MESSAGE --------
  if p_event = 'message_posted' then
    begin
      -- 1 seul "streak_by_message" par jour et par utilisateur
      insert into gamification_events(user_id, event_type, ref_id, meta, xp, coins)
      values (v_uid, 'streak_by_message', null,
              jsonb_build_object('source','message_posted') || coalesce(p_meta,'{}'::jsonb),
              0, 0)
      returning id into v_streak_event_id;

      v_streak_awarded := true;
    exception when unique_violation then
      v_streak_awarded := false;
    end;

    if v_streak_awarded then
      update gamification_balances b
      set
        streak_current = case
          when b.last_active_day = v_today - 1 then b.streak_current + 1
          when b.last_active_day = v_today     then b.streak_current
          else 1
        end,
        streak_longest = greatest(
          b.streak_longest,
          case
            when b.last_active_day = v_today - 1 then b.streak_current + 1
            when b.last_active_day = v_today     then b.streak_current
            else 1
          end
        ),
        last_active_day = v_today
      where b.user_id = v_uid
      returning * into v_bal;
    end if;
  end if;

  -- -------- RETOUR --------
  return query
  select v_bal.xp as new_xp,
         v_bal.coins as new_coins,
         (v_bal.xp / 100) + 1 as level,
         v_bal.streak_current,
         coalesce(v_awarded, false) as awarded,
         coalesce(v_event_id, v_streak_event_id);
end;
$function$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Sous l'identité d'un compte quelconque :
--   SELECT award_event('message_posted', '999999999');  -- doit lever
--   SELECT award_event('message_posted', 'abc');        -- doit lever
--   SELECT award_event('message_posted', '<id d''un message d''un AUTRE>');
--                                                       -- doit lever
-- Et le chemin légitime — un message que l'on vient d'écrire — doit rester
-- accepté et créditer 5 XP / 1 pièce.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Réappliquer la définition précédente, identique à celle-ci moins les deux
-- contrôles `p_ref !~ '^[0-9]+$'` et `not exists (... chat_messages ...)`.
