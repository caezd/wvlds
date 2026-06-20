-- Déduplication des notifications de mention par message.
-- Le trigger enforce_notification_preference est étendu pour ignorer silencieusement
-- un INSERT si une notification de mention existe déjà pour ce (recipient_id, message_id).
-- Un index unique partiel sert de filet de sécurité contre les race conditions.

CREATE OR REPLACE FUNCTION public.enforce_notification_preference()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- 1. Vérifier les préférences de notification
  SELECT enabled INTO v_enabled
  FROM public.notification_preferences
  WHERE user_id = NEW.recipient_id AND type = NEW.type;

  IF v_enabled = false THEN
    RETURN NULL; -- annule l'INSERT
  END IF;

  -- 2. Dédupliquer les mentions par message (envoi initial + éditions)
  IF NEW.type = 'mention' AND NEW.message_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'mention'
        AND recipient_id = NEW.recipient_id
        AND message_id = NEW.message_id
    ) THEN
      RETURN NULL; -- déjà notifié pour ce message
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Index unique partiel comme filet de sécurité contre les race conditions
CREATE UNIQUE INDEX IF NOT EXISTS notifications_mention_dedup
  ON public.notifications (recipient_id, message_id)
  WHERE type = 'mention' AND message_id IS NOT NULL;
