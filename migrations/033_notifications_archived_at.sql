-- Ajout d'un champ archived_at pour l'archivage soft des notifications.
-- Une notification archivée n'est plus fetchée dans la liste.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index partiel pour les notifications actives (non archivées)
CREATE INDEX IF NOT EXISTS notifications_recipient_active
  ON public.notifications (recipient_id, created_at DESC)
  WHERE archived_at IS NULL;
