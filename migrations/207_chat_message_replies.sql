-- 207 — Répondre à un message.
--
-- Un message peut désigner celui auquel il répond. La vue l'affiche en
-- citation (auteur + extrait) au-dessus du texte, cliquable pour y remonter.
--
-- Une colonne et non une entrée de `metadata` : un extrait du message cité
-- copié dans `metadata` y serait EN CLAIR, alors que le contenu des salons
-- chiffrés ne l'est jamais en base. Ici seul l'id est stocké ; le message
-- cité est joint à la lecture (`reply_to:reply_to_id(...)`), déchiffré côté
-- client comme les autres, et soumis à la même policy de lecture — une note
-- privée citée reste invisible à qui n'en est pas destinataire.
--
-- ON DELETE SET NULL : la réponse survit à la suppression du message cité,
-- qui s'affiche alors comme indisponible.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id bigint REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_reply_to_id_idx
  ON public.chat_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- Une réponse ne cite qu'un message DU MÊME SALON. Le client ne propose pas
-- autre chose ; ceci empêche un appel direct de lier deux salons (la jointure
-- n'en révélerait rien grâce à la policy, mais le lien n'a pas de sens).
CREATE OR REPLACE FUNCTION public.chat_message_reply_same_chat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = NEW.reply_to_id AND m.chat_id = NEW.chat_id
  ) THEN
    NEW.reply_to_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_reply_same_chat ON public.chat_messages;
CREATE TRIGGER trg_chat_message_reply_same_chat
  BEFORE INSERT OR UPDATE OF reply_to_id ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_message_reply_same_chat();

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_chat_message_reply_same_chat ON public.chat_messages;
-- DROP FUNCTION IF EXISTS public.chat_message_reply_same_chat();
-- ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS reply_to_id;
