-- 206 — Non-lus en temps réel : diffusion depuis la base (broadcast).
--
-- Chaque client s'abonnait aux INSERT de `chat_messages` de tous ses mondes
-- (`postgres_changes`, un filtre par monde). Pour CHAQUE message posté,
-- Realtime évaluait alors la policy de lecture de `chat_messages` pour CHAQUE
-- abonné de ce monde : un coût proportionnel au nombre de connectés, payé à
-- chaque message, et la première limite qu'atteindraient de gros mondes actifs.
--
-- Désormais un trigger diffuse un avis minimal (ids seulement, jamais le
-- contenu) sur des canaux PRIVÉS, dont l'accès est vérifié UNE fois, à
-- l'abonnement, par la policy de `realtime.messages` ci-dessous :
--   - `world-msgs:<world_id>` : message visible de tout le monde → membres du
--     monde (même règle que la lecture de `chat_messages` : is_world_member) ;
--   - `msgs:<user_id>` : message à destinataires restreints (`visible_to`) →
--     chacun de ses destinataires seulement. Les autres membres n'apprennent
--     même pas qu'il existe, comme avec la policy de `chat_messages`.
--
-- Déploiement : appliquer AVANT le code client qui écoute ces canaux. L'ancien
-- client ignore ces diffusions ; le nouveau, sans elles, ne verrait plus les
-- non-lus arriver en direct (ils resteraient justes au chargement).
--
-- Limite connue : l'autorisation d'un canal privé est vérifiée à l'abonnement.
-- Un membre retiré d'un monde reçoit encore les avis (ids de salon et
-- d'auteur, pas de contenu) jusqu'à sa prochaine reconnexion.

CREATE OR REPLACE FUNCTION public.broadcast_new_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  avis jsonb;
  destinataire uuid;
BEGIN
  IF NEW.world_id IS NULL THEN
    RETURN NULL;
  END IF;

  avis := jsonb_build_object(
    'id', NEW.id,
    'chat_id', NEW.chat_id,
    'world_id', NEW.world_id,
    'author_id', NEW.author_id
  );

  IF NEW.visible_to IS NULL THEN
    PERFORM realtime.send(avis, 'message', 'world-msgs:' || NEW.world_id::text, true);
  ELSE
    FOREACH destinataire IN ARRAY NEW.visible_to LOOP
      PERFORM realtime.send(avis, 'message', 'msgs:' || destinataire::text, true);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Un avis temps réel ne doit jamais faire échouer l'envoi d'un message.
  RAISE WARNING 'broadcast_new_chat_message : %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broadcast_new_chat_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_broadcast_new_chat_message ON public.chat_messages;
CREATE TRIGGER trg_broadcast_new_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_new_chat_message();

-- Qui peut s'abonner à quel canal privé. Les canaux publics (présence, frappe…)
-- ne sont pas concernés : cette policy ne s'applique qu'aux canaux privés.
DROP POLICY IF EXISTS "wvlds_message_topics_read" ON realtime.messages;
CREATE POLICY "wvlds_message_topics_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      (
        (SELECT realtime.topic()) ~ '^world-msgs:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 12)::uuid, (SELECT auth.uid()))
      )
      OR (SELECT realtime.topic()) = 'msgs:' || (SELECT auth.uid())::text
    )
  );

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- DROP POLICY IF EXISTS "wvlds_message_topics_read" ON realtime.messages;
-- DROP TRIGGER IF EXISTS trg_broadcast_new_chat_message ON public.chat_messages;
-- DROP FUNCTION IF EXISTS public.broadcast_new_chat_message();
-- (et redéployer le client qui écoute `postgres_changes`).
