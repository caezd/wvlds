-- 217 — Supprimer un message ne vide plus le résumé du salon.
--
-- 1. `recompute_summary_on_delete` testait `IF v_last IS NOT NULL` sur la LIGNE
--    entière du dernier message. En PL/pgSQL, ce test n'est vrai que si TOUTES
--    les colonnes sont non nulles — or un message ordinaire en a toujours de
--    vides (`visible_to`, `reply_to_id`…). Chaque suppression, même d'un vieux
--    message, prenait donc la branche « plus aucun message » et SUPPRIMAIT le
--    résumé : la barre latérale perdait l'avatar du dernier posteur, l'heure et
--    l'aperçu, jusqu'au message suivant. On teste désormais `FOUND`.
--
-- 2. L'avis `summary` (migration 214) ne portait que l'avatar de la persona ;
--    `list_chatrooms_nav` retombe sur l'avatar du profil quand la persona n'en
--    a pas. Le temps réel montrait donc un rond vide là où le chargement
--    montrait le profil. L'avis porte maintenant la même valeur.
--
-- 3. Le garde-fou de la migration 216 rétablissait `insert_before_id` à chaque
--    mise à jour — y compris quand la base le remet à NULL parce que le message
--    visé est supprimé (ON DELETE SET NULL). Supprimer un message devant lequel
--    on en avait inséré un autre échouait. Seul le passage à NULL est permis.

CREATE OR REPLACE FUNCTION public.recompute_summary_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_last            record;
  v_author_username text;
  v_author_avatar   text;
  v_persona_name    text;
  v_persona_avatar  text;
begin
  select m.* into v_last
  from public.chat_messages m
  where m.chat_id = old.chat_id
  order by m.created_at desc, m.id desc
  limit 1;

  if found then
    select p.username, p.avatar_url
      into v_author_username, v_author_avatar
    from public.profiles p
    where p.id = v_last.author_id;

    if v_last.persona_id is not null then
      select pe.name, pe.avatar_url
        into v_persona_name, v_persona_avatar
      from public.personas pe
      where pe.id = v_last.persona_id;
    end if;

    update public.chatroom_summaries s set
      last_message_id               = v_last.id,
      last_message_at               = v_last.created_at,
      last_message_excerpt          = public.msg_excerpt(v_last.content, 140),
      last_message_author_id        = v_last.author_id,
      last_message_author_username  = v_author_username,
      last_message_persona_avatar_url = COALESCE(v_persona_avatar, v_author_avatar),
      last_message_persona_id       = v_last.persona_id,
      last_message_persona_name     = v_persona_name
    where s.chat_id = old.chat_id;

    update public.chatrooms c set updated_at = v_last.created_at where c.id = old.chat_id;
  else
    delete from public.chatroom_summaries where chat_id = old.chat_id;
  end if;

  return old;
end;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_world_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatroom_summaries%ROWTYPE;
  monde uuid;
  avatar text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  SELECT c.world_id INTO monde FROM public.chatrooms c WHERE c.id = r.chat_id;
  IF monde IS NULL THEN RETURN NULL; END IF;  -- salon supprimé avec son résumé
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id));
  ELSE
    -- Même repli que list_chatrooms_nav : l'avatar du profil quand la
    -- persona n'en a pas.
    avatar := r.last_message_persona_avatar_url;
    IF avatar IS NULL AND r.last_message_author_id IS NOT NULL THEN
      SELECT p.avatar_url INTO avatar FROM public.profiles p WHERE p.id = r.last_message_author_id;
    END IF;
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id,
                         'last_message_at', r.last_message_at,
                         'last_message_author_id', r.last_message_author_id,
                         'last_message_persona_avatar_url', avatar));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_message_insert_before()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cible timestamptz;
  precedent timestamptz;
  date_calculee timestamptz;
BEGIN
  -- Une édition ne change ni la cible ni la date réelle d'envoi. Seul le
  -- passage de la cible à NULL est permis : c'est ce que fait la base quand
  -- le message visé est supprimé (ON DELETE SET NULL).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.insert_before_id IS NOT NULL THEN
      NEW.insert_before_id := OLD.insert_before_id;
    END IF;
    NEW.inserted_at := OLD.inserted_at;
    RETURN NEW;
  END IF;

  IF NEW.insert_before_id IS NULL THEN
    NEW.inserted_at := NULL;
    RETURN NEW;
  END IF;

  SELECT m.created_at INTO cible
  FROM public.chat_messages m
  WHERE m.id = NEW.insert_before_id AND m.chat_id = NEW.chat_id;
  IF cible IS NULL THEN
    RAISE EXCEPTION 'Message à précéder introuvable dans ce salon'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT max(m.created_at) INTO precedent
  FROM public.chat_messages m
  WHERE m.chat_id = NEW.chat_id AND m.created_at < cible;

  date_calculee := cible - interval '2 seconds';
  IF precedent IS NOT NULL AND date_calculee <= precedent THEN
    date_calculee := precedent + (cible - precedent) / 2;
  END IF;

  NEW.created_at := date_calculee;
  NEW.inserted_at := now();
  RETURN NEW;
END;
$$;
