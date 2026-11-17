-- 216 — « Insérer avant » : poster un message juste avant un message existant.
--
-- Comme « Répondre » : depuis le menu d'un message, le composeur passe en mode
-- insertion ; le message envoyé prend place dans le fil juste AVANT le message
-- choisi (une réplique oubliée, par exemple).
--
-- L'ordre du fil, la pagination et le rattrapage reposent sur `created_at`.
-- Plutôt que d'ajouter une clé d'ordre, la base date le message inséré juste
-- avant sa cible : deux secondes avant elle, ou au milieu de l'intervalle si le
-- message précédent est plus proche — sans quoi l'inséré passerait aussi devant
-- lui. La date réelle d'envoi est gardée dans `inserted_at`, affichée par la
-- mention « Inséré avant · <date> ».
--
-- C'est le TRIGGER qui calcule ces dates, jamais le client : `inserted_at` et
-- la date d'un message inséré ne peuvent pas être choisis par l'auteur.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS insert_before_id bigint
    REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inserted_at timestamptz;

COMMENT ON COLUMN public.chat_messages.insert_before_id IS
  'Message devant lequel celui-ci a été inséré (« Insérer avant »), sinon null.';
COMMENT ON COLUMN public.chat_messages.inserted_at IS
  'Date réelle d''envoi d''un message inséré ; created_at le place dans le fil.';

-- ── Datation d'un message inséré ─────────────────────────────────
-- SECURITY INVOKER : la cible est lue sous les policies de l'auteur. Une note
-- privée qu'il ne voit pas est donc « introuvable », comme une cible d'un
-- autre salon.
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
  -- Une édition ne change ni la cible ni la date réelle d'envoi.
  IF TG_OP = 'UPDATE' THEN
    NEW.insert_before_id := OLD.insert_before_id;
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

DROP TRIGGER IF EXISTS trg_chat_message_insert_before ON public.chat_messages;
CREATE TRIGGER trg_chat_message_insert_before
  BEFORE INSERT OR UPDATE OF insert_before_id, inserted_at ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_message_insert_before();

-- ── Résumé du salon : seulement pour le DERNIER message du fil ───
-- Un message inséré n'est pas le dernier : il ne doit ni remplacer l'aperçu de
-- la barre latérale, ni remonter le salon. Le même garde-fou corrige un défaut
-- plus ancien : modifier un vieux message en faisait le « dernier message » du
-- résumé. Modifier le dernier message (même date) le met toujours à jour.
CREATE OR REPLACE FUNCTION public.upsert_chatroom_summary_from_new()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_author_username text;
  v_persona_name   text;
  v_persona_avatar  text;
begin
  select p.username
    into v_author_username
  from public.profiles p
  where p.id = new.author_id;

  if new.persona_id is not null then
    select pe.name, pe.avatar_url into v_persona_name, v_persona_avatar
    from public.personas pe
    where pe.id = new.persona_id;
  end if;

  insert into public.chatroom_summaries as s (
    chat_id, last_message_id, last_message_at, last_message_excerpt,
    last_message_author_id, last_message_author_username,
    last_message_persona_avatar_url, last_message_persona_id, last_message_persona_name
  ) values (
    new.chat_id, new.id, new.created_at, public.msg_excerpt(new.content, 140),
    new.author_id, v_author_username,
    v_persona_avatar, new.persona_id, v_persona_name
  )
  on conflict (chat_id) do update set
    last_message_id = excluded.last_message_id,
    last_message_at = excluded.last_message_at,
    last_message_excerpt = excluded.last_message_excerpt,
    last_message_author_id = excluded.last_message_author_id,
    last_message_author_username = excluded.last_message_author_username,
    last_message_persona_avatar_url = excluded.last_message_persona_avatar_url,
    last_message_persona_id = excluded.last_message_persona_id,
    last_message_persona_name = excluded.last_message_persona_name
  where s.last_message_at is null
     or excluded.last_message_at > s.last_message_at
     or (excluded.last_message_at = s.last_message_at and excluded.last_message_id >= s.last_message_id);

  -- on garde chatrooms.updated_at synchro pour le tri / realtime
  update public.chatrooms c set updated_at = greatest(c.updated_at, new.created_at) where c.id = new.chat_id;

  return new;
end;
$$;
