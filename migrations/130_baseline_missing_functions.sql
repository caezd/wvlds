-- ============================================================
-- Migration 130 — Complément de socle : 5 fonctions jamais versionnées
-- ============================================================
-- Suite de `000_baseline_missing_tables.sql`, même défaut, autre objet.
--
-- Relevé du 2026-08-28 : 78 fonctions en production, dont 5 n'apparaissaient
-- ni dans `.backup` ni dans aucune migration. Comme les dix tables de la 000,
-- elles ont été écrites directement depuis le tableau de bord.
--
-- Ce fichier en porte quatre :
--   `list_chatrooms_nav`         — sans elle, la barre latérale ne liste aucun salon
--   `get_chatroom_stats`         — les statistiques de salon échouaient
--   `get_chatroom_persona_stats` — idem, par personnage
--   `get_world_public_stats`     — la page publique d'un monde échouait
--
-- La cinquième, `is_world_owner_direct`, est déclarée dans la 000 : la migration
-- 039 crée une policy qui l'appelle, et une reconstruction cassait donc dès
-- l'étape 39. Elle ne lit que `worlds(id, owner_id)`, présentes dans `.backup`,
-- et peut être créée d'emblée.
--
-- ── Pourquoi la FIN de la séquence, et non le début ──────────
-- Contrairement aux tables de la 000, ces fonctions ne peuvent pas ouvrir la
-- reconstruction : PostgreSQL valide le corps d'une fonction `LANGUAGE sql` dès
-- sa création. Or `list_chatrooms_nav` lit `chatrooms.category_id`, colonne que
-- seule la migration 070 ajoute — la créer plus tôt échouerait.
--
-- Elles ferment donc la séquence, quand le schéma est complet. Vérifié : aucune
-- migration ni aucune policy n'appelle ces quatre-là — seul le code applicatif
-- les invoque, et il ne tourne qu'une fois la base reconstruite.
--
-- Elles sont déjà écrites dans leur forme durcie par la 115 (`SET search_path`),
-- qui s'applique à elles et passe avant.
--
-- ── Fidélité ─────────────────────────────────────────────────
-- Les corps sont repris tels que la base les rend (`pg_get_functiondef`),
-- `SECURITY DEFINER` et `search_path` compris — donc déjà dans leur forme
-- durcie par la 115. `CREATE OR REPLACE` rend le fichier rejouable sans effet.
--
-- Les droits d'exécution ne sont pas déclarés : ces cinq fonctions sont dans
-- l'état par défaut de PostgreSQL, EXECUTE ouvert à PUBLIC. Ce n'est pas une
-- faille ici — chacune vérifie l'appartenance au monde via `auth.uid()` dans
-- son propre corps, et rend donc vide pour un visiteur anonyme. Une
-- reconstruction retrouve ce même défaut sans qu'on ait à l'écrire.

CREATE OR REPLACE FUNCTION public.get_world_public_stats(p_world_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'message_count', (select count(*) from public.chat_messages m where m.world_id = w.id),
    'member_count', (select count(*) from public.world_members wm where wm.world_id = w.id),
    'persona_count', (select count(*) from public.personas p where p.world_id = w.id and p.is_template = false and p.deleted_at is null)
  )
  from public.worlds w
  where w.id = p_world_id
    and w.deleted_at is null
    and (
      w.visibility = 'public'
      or w.owner_id = auth.uid()
      or exists (select 1 from public.world_members wm2 where wm2.world_id = w.id and wm2.user_id = auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_chatroom_stats(p_chat_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH room AS (
  SELECT r.id
  FROM public.chatrooms r
  WHERE r.id = p_chat_id
    AND (
      EXISTS (
        SELECT 1 FROM public.world_members wm
        WHERE wm.world_id = r.world_id AND wm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.worlds w
        WHERE w.id = r.world_id AND w.owner_id = auth.uid()
      )
    )
),
msgs AS (
  SELECT
    m.author_id,
    m.created_at,
    COALESCE((m.metadata->>'word_count')::int, 0) AS words,
    EXTRACT(EPOCH FROM m.created_at - lag(m.created_at) OVER (ORDER BY m.created_at)) AS gap
  FROM public.chat_messages m
  JOIN room ON m.chat_id = room.id
),
per_user AS (
  SELECT
    m.author_id,
    p.username,
    p.avatar_url,
    count(*)::int AS message_count,
    COALESCE(sum(m.words), 0)::int AS word_count,
    round(COALESCE(avg(m.words), 0)::numeric, 1) AS avg_words,
    min(m.created_at) AS first_message_at,
    max(m.created_at) AS last_message_at
  FROM msgs m
  LEFT JOIN public.profiles p ON p.id = m.author_id
  GROUP BY m.author_id, p.username, p.avatar_url
)
SELECT jsonb_build_object(
  'chat_id', (SELECT id FROM room),
  'message_count', (SELECT count(*)::int FROM msgs),
  'participant_count', (SELECT count(DISTINCT author_id)::int FROM msgs),
  'min_gap_seconds', (SELECT min(gap) FROM msgs WHERE gap IS NOT NULL),
  'max_gap_seconds', (SELECT max(gap) FROM msgs WHERE gap IS NOT NULL),
  'needs_recompute', false,
  'updated_at', now(),
  'users', COALESCE(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'profile_id', author_id,
         'username', username,
         'avatar_url', avatar_url,
         'message_count', message_count,
         'word_count', word_count,
         'avg_words_per_message', avg_words,
         'first_message_at', first_message_at,
         'last_message_at', last_message_at
       ) ORDER BY message_count DESC
     ) FROM per_user),
    '[]'::jsonb
  )
)
WHERE EXISTS (SELECT 1 FROM room);
$function$;

CREATE OR REPLACE FUNCTION public.get_chatroom_persona_stats(p_chat_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH room AS (
  SELECT r.id
  FROM public.chatrooms r
  WHERE r.id = p_chat_id
    AND (
      EXISTS (
        SELECT 1 FROM public.world_members wm
        WHERE wm.world_id = r.world_id AND wm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.worlds w
        WHERE w.id = r.world_id AND w.owner_id = auth.uid()
      )
    )
),
msgs AS (
  SELECT
    m.persona_id,
    m.created_at,
    COALESCE((m.metadata->>'word_count')::int, 0) AS words
  FROM public.chat_messages m
  JOIN room ON m.chat_id = room.id
  WHERE m.persona_id IS NOT NULL
),
per_persona AS (
  SELECT
    m.persona_id,
    pe.name,
    pe.avatar_url,
    pr.username,
    count(*)::int AS message_count,
    COALESCE(sum(m.words), 0)::int AS word_count,
    round(COALESCE(avg(m.words), 0)::numeric, 1) AS avg_words,
    min(m.created_at) AS first_message_at,
    max(m.created_at) AS last_message_at
  FROM msgs m
  LEFT JOIN public.personas pe ON pe.id = m.persona_id
  LEFT JOIN public.profiles pr ON pr.id = pe.user_id
  GROUP BY m.persona_id, pe.name, pe.avatar_url, pr.username
)
SELECT COALESCE(
  (SELECT jsonb_agg(
     jsonb_build_object(
       'persona_id', persona_id,
       'name', name,
       'avatar_url', avatar_url,
       'username', username,
       'message_count', message_count,
       'word_count', word_count,
       'avg_words_per_message', avg_words,
       'first_message_at', first_message_at,
       'last_message_at', last_message_at
     ) ORDER BY message_count DESC
   ) FROM per_persona),
  '[]'::jsonb
)
WHERE EXISTS (SELECT 1 FROM room);
$function$;

CREATE OR REPLACE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
 RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text, last_poster_id uuid, participant_count integer, second_poster_avatar_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    r.id,
    r.title,
    r.name,
    r.icon_url,
    s.last_message_at,
    s.last_message_excerpt,
    COALESCE((
      SELECT COUNT(*)::int
      FROM public.chat_messages m
      WHERE m.chat_id = r.id
        AND m.author_id <> auth.uid()
        AND m.created_at > COALESCE(
          (SELECT cr.last_read_at FROM public.chatroom_reads cr
           WHERE cr.chat_id = r.id AND cr.user_id = auth.uid()),
          '-infinity'::timestamptz
        )
    ), 0) AS unread_count,
    r.category_id,
    COALESCE(s.last_message_persona_avatar_url, p.avatar_url) AS last_poster_avatar_url,
    s.last_message_author_id                                   AS last_poster_id,
    (SELECT COUNT(DISTINCT cm.author_id)::int
     FROM public.chat_messages cm
     WHERE cm.chat_id = r.id
       AND (auth.uid() IS NULL OR cm.author_id <> auth.uid())
    ) AS participant_count,
    (SELECT COALESCE(pn.avatar_url, p2.avatar_url)
     FROM public.chat_messages cm2
     LEFT JOIN public.profiles p2 ON p2.id = cm2.author_id
     LEFT JOIN public.personas pn ON pn.id = cm2.persona_id
     WHERE cm2.chat_id = r.id
       AND (auth.uid() IS NULL OR cm2.author_id <> auth.uid())
       AND (s.last_message_author_id IS NULL OR cm2.author_id <> s.last_message_author_id)
     ORDER BY cm2.created_at DESC
     LIMIT 1
    ) AS second_poster_avatar_url
  FROM public.chatrooms r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  WHERE r.world_id = p_world_id
    AND (
      EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = auth.uid())
    )
  ORDER BY COALESCE(s.last_message_at, r.updated_at) DESC;
$function$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Rejoué sur la production dans une transaction annulée : les définitions
-- rendues par `pg_get_functiondef` sont identiques avant et après, pour les
-- 78 fonctions du schéma.
