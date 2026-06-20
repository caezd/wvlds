-- Trigger BEFORE INSERT universel sur notifications.
-- Annule l'insertion si le destinataire a désactivé ce type de notification.
-- Couvre les inserts client (mention) et sert de filet pour les triggers existants.

CREATE OR REPLACE FUNCTION public.enforce_notification_preference()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO v_enabled
  FROM public.notification_preferences
  WHERE user_id = NEW.recipient_id AND type = NEW.type;

  -- NULL = aucune préférence définie → activé par défaut
  IF v_enabled = false THEN
    RETURN NULL; -- annule l'INSERT
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_notification_insert ON public.notifications;
CREATE TRIGGER before_notification_insert
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_preference();
