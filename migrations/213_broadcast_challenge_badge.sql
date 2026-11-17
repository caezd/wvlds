-- 213 — Défi gagné : avis en direct sur le canal privé du salon.
--
-- Le salon s'abonnait aux INSERT de `challenge_attempts` en `postgres_changes`,
-- mais la table n'a jamais fait partie de la publication `supabase_realtime` :
-- l'abonnement ne recevait rien, et le badge « défi relevé » n'apparaissait
-- chez les autres qu'au rechargement. Plutôt que d'ajouter la table à la
-- publication (chaque changement serait alors vérifié abonné par abonné), la
-- base diffuse un avis sur `room:<chat_id>` (migration 212), dont l'accès est
-- vérifié une fois, à l'abonnement.
--
-- Événement `challenge` : { message_id, title, description }.
-- Le titre et la description sont lisibles par tout membre du monde (policies
-- de `challenges`), comme le badge déjà joint à chaque message.
--
-- `complete_challenge` INSÈRE la tentative, ou passe une tentative « failed »
-- à « won » (ON CONFLICT DO UPDATE) : les deux sont annoncées. Une note
-- privée (`visible_to`) n'est pas annoncée sur le canal du salon ; son badge
-- arrive par la relecture des messages, comme le reste de la note.

CREATE OR REPLACE FUNCTION public.broadcast_room_challenge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  defi record;
BEGIN
  IF NEW.status <> 'won' OR NEW.chat_id IS NULL OR NEW.message_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'won'
     AND OLD.message_id IS NOT DISTINCT FROM NEW.message_id THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = NEW.message_id AND m.visible_to IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  SELECT c.title, c.description INTO defi
  FROM public.challenges c
  WHERE c.id = NEW.challenge_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('message_id', NEW.message_id, 'title', defi.title, 'description', defi.description),
    'challenge', 'room:' || NEW.chat_id::text, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_challenge : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_challenge ON public.challenge_attempts;
CREATE TRIGGER trg_broadcast_room_challenge
  AFTER INSERT OR UPDATE OF status, chat_id, message_id ON public.challenge_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_challenge();
