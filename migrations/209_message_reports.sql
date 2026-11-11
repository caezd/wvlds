-- 209 — Signalement de messages et file de modération d'un monde.
--
-- Un membre signale un message qu'il peut lire, avec une raison. Les
-- signalements d'un monde sont traités par qui a « Gérer les salons »
-- (`chatrooms.manage`) — et donc par les administrateurs et le propriétaire,
-- cf. has_world_permission. Pas de permission dédiée pour l'instant : la liste
-- `world_permission_keys()` de la production diverge du dépôt (branches non
-- fusionnées) et ne peut pas être réécrite sans risque.
--
-- Le traitement passe par `resolve_message_report` : classer le signalement,
-- ou supprimer le message signalé. La policy de suppression de
-- `chat_messages` reste « l'auteur seul » : un modérateur ne supprime que des
-- messages SIGNALÉS, dans un monde où il a la permission.

CREATE TABLE IF NOT EXISTS public.message_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL : le signalement reste dans l'historique une fois le message supprimé.
  message_id  bigint      REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  chat_id     uuid        NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  world_id    uuid        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  -- Auteur du message signalé, conservé si le message disparaît.
  message_author_id uuid  REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_id uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Un signalement ouvert par personne et par message.
CREATE UNIQUE INDEX IF NOT EXISTS message_reports_one_open_per_reporter
  ON public.message_reports (message_id, reporter_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS message_reports_world_open
  ON public.message_reports (world_id, created_at DESC) WHERE status = 'open';

ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

-- Salon, monde et auteur viennent du message, jamais du client ; le
-- signaleur est toujours l'appelant. Le message doit être LISIBLE par lui
-- (la sous-requête passe par la policy de lecture de `chat_messages`).
CREATE OR REPLACE FUNCTION public.message_report_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  msg record;
BEGIN
  SELECT m.chat_id, m.world_id, m.author_id INTO msg
  FROM public.chat_messages m
  WHERE m.id = NEW.message_id;
  IF NOT FOUND OR msg.world_id IS NULL THEN
    RAISE EXCEPTION 'message introuvable' USING ERRCODE = '42501';
  END IF;
  IF msg.author_id = auth.uid() THEN
    RAISE EXCEPTION 'on ne signale pas son propre message' USING ERRCODE = '42501';
  END IF;
  NEW.chat_id := msg.chat_id;
  NEW.world_id := msg.world_id;
  NEW.message_author_id := msg.author_id;
  NEW.reporter_id := auth.uid();
  NEW.status := 'open';
  NEW.resolved_at := NULL;
  NEW.resolved_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_report_fill ON public.message_reports;
CREATE TRIGGER trg_message_report_fill
  BEFORE INSERT ON public.message_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.message_report_fill();

DROP POLICY IF EXISTS message_reports_insert ON public.message_reports;
CREATE POLICY message_reports_insert ON public.message_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND public.is_world_member(world_id, (SELECT auth.uid())));

-- Chacun voit ses propres signalements ; les modérateurs, ceux de leur monde.
DROP POLICY IF EXISTS message_reports_select ON public.message_reports;
CREATE POLICY message_reports_select ON public.message_reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = (SELECT auth.uid())
    OR public.has_world_permission(world_id, (SELECT auth.uid()), 'chatrooms.manage')
  );

-- Pas de policy UPDATE / DELETE : le traitement passe par la fonction ci-dessous.

/**
 * Traite un signalement : 'dismiss' le classe ; 'delete' supprime le message
 * signalé et classe comme traités TOUS les signalements ouverts de ce message.
 */
CREATE OR REPLACE FUNCTION public.resolve_message_report(p_report_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rep public.message_reports%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF p_action NOT IN ('dismiss', 'delete') THEN
    RAISE EXCEPTION 'action inconnue' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO rep FROM public.message_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_world_permission(rep.world_id, uid, 'chatrooms.manage') THEN
    RAISE EXCEPTION 'non autorisé' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'dismiss' THEN
    UPDATE public.message_reports
       SET status = 'dismissed', resolved_at = now(), resolved_by = uid
     WHERE id = p_report_id;
    RETURN;
  END IF;

  -- 'delete' : tous les signalements ouverts du message sont réglés d'un coup.
  UPDATE public.message_reports
     SET status = 'actioned', resolved_at = now(), resolved_by = uid
   WHERE id = p_report_id OR (message_id = rep.message_id AND status = 'open');
  IF rep.message_id IS NOT NULL THEN
    DELETE FROM public.chat_messages WHERE id = rep.message_id AND world_id = rep.world_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_message_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_message_report(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.message_report_fill() FROM PUBLIC, anon, authenticated;

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.resolve_message_report(uuid, text);
-- DROP TABLE IF EXISTS public.message_reports;
-- DROP FUNCTION IF EXISTS public.message_report_fill();
