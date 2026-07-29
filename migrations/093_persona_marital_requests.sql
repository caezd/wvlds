-- ============================================================
-- Migration 093 — Demandes de statut marital entre personas
-- ============================================================
-- Jusqu'ici, marquer un persona A "marié·e"/"en couple" avec un persona B
-- écrivait directement spouse_persona_id sur la ligne de A uniquement : B
-- n'était jamais mis à jour (et ne pouvait pas l'être, la RLS
-- personas_update_own interdisant d'écrire la ligne d'un autre joueur).
-- Cette migration introduit une table de demande en attente (calquée sur
-- world_invitations) : A envoie une demande à B, qui reçoit une
-- notification et doit l'accepter pour que les deux lignes personas soient
-- mises à jour de façon réciproque.

-- ── 1. Table de demande ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.persona_marital_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_persona_id  UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  target_persona_id     UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  requested_status      TEXT NOT NULL CHECK (requested_status IN ('in_relationship', 'married')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_persona_id <> target_persona_id)
);

CREATE INDEX IF NOT EXISTS idx_persona_marital_requests_target
  ON public.persona_marital_requests (target_persona_id);

-- Une seule demande active à la fois entre les deux mêmes personas.
CREATE UNIQUE INDEX IF NOT EXISTS persona_marital_requests_active_pair
  ON public.persona_marital_requests (requester_persona_id, target_persona_id)
  WHERE status = 'pending';

ALTER TABLE public.persona_marital_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persona_marital_requests: read own"
  ON public.persona_marital_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = requester_persona_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.personas p WHERE p.id = target_persona_id AND p.user_id = auth.uid())
  );

CREATE POLICY "persona_marital_requests: insert as requester"
  ON public.persona_marital_requests FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = requester_persona_id AND p.user_id = auth.uid())
  );

-- Refus (par la cible) ou annulation (par le demandeur) : simple DELETE,
-- comme world_invitations. L'acceptation, elle, passe par la fonction
-- ci-dessous (elle doit écrire les DEUX lignes personas).
CREATE POLICY "persona_marital_requests: delete own"
  ON public.persona_marital_requests FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = requester_persona_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.personas p WHERE p.id = target_persona_id AND p.user_id = auth.uid())
  );

-- ── 2. Garde-fou : mêmes règles que enforce_spouse_same_world ────────────

CREATE OR REPLACE FUNCTION public.enforce_marital_request_same_world()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester_world UUID;
  v_target_world UUID;
BEGIN
  SELECT world_id INTO v_requester_world FROM public.personas WHERE id = NEW.requester_persona_id;
  SELECT world_id INTO v_target_world FROM public.personas WHERE id = NEW.target_persona_id;
  IF v_requester_world IS NULL OR v_target_world IS NULL OR v_requester_world IS DISTINCT FROM v_target_world THEN
    RAISE EXCEPTION 'requester and target personas must be in the same world'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_marital_request_same_world ON public.persona_marital_requests;
CREATE TRIGGER trg_enforce_marital_request_same_world
  BEFORE INSERT ON public.persona_marital_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_marital_request_same_world();

-- ── 3. Nouveau type de notification ──────────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply', 'marital_request'
  ));

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply', 'marital_request'
  ));

-- ── 4. Trigger : notifier le persona ciblé ───────────────────
-- Le filtre notification_preferences est déjà appliqué par le trigger
-- universel before_notification_insert (migration 032/035) : pas besoin de
-- le revérifier ici.

CREATE OR REPLACE FUNCTION public.notify_on_marital_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_user      UUID;
  v_world_id         UUID;
  v_requester_user   UUID;
  v_requester_name   TEXT;
  v_requester_avatar TEXT;
  v_target_name      TEXT;
BEGIN
  SELECT user_id, world_id INTO v_target_user, v_world_id
  FROM public.personas WHERE id = NEW.target_persona_id;

  IF v_target_user IS NULL THEN RETURN NEW; END IF;

  SELECT user_id, name, avatar_url INTO v_requester_user, v_requester_name, v_requester_avatar
  FROM public.personas WHERE id = NEW.requester_persona_id;

  SELECT name INTO v_target_name FROM public.personas WHERE id = NEW.target_persona_id;

  INSERT INTO public.notifications
    (recipient_id, type, world_id, actor_id, actor_name, persona_id, content, metadata)
  VALUES
    (v_target_user, 'marital_request', v_world_id, v_requester_user, v_requester_name, NEW.requester_persona_id, v_target_name,
     jsonb_build_object(
       'icon_url', v_requester_avatar,
       'requested_status', NEW.requested_status,
       'request_id', NEW.id,
       'target_persona_id', NEW.target_persona_id
     ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_marital_request_notify ON public.persona_marital_requests;
CREATE TRIGGER on_marital_request_notify
  AFTER INSERT ON public.persona_marital_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_marital_request();

-- ── 5. Acceptation (SECURITY DEFINER — écrit les deux lignes personas) ──
-- Le refus/l'annulation n'a pas besoin de fonction dédiée : un simple
-- DELETE (policy "persona_marital_requests: delete own") suffit, comme
-- pour world_invitations.

CREATE OR REPLACE FUNCTION public.accept_marital_request(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester UUID;
  v_target UUID;
  v_requested_status TEXT;
  v_old_requester_spouse UUID;
  v_old_target_spouse UUID;
BEGIN
  SELECT requester_persona_id, target_persona_id, requested_status
    INTO v_requester, v_target, v_requested_status
  FROM public.persona_marital_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Demande introuvable ou déjà traitée.' USING ERRCODE = 'P0001';
  END IF;

  -- Seul·e le/la propriétaire du persona ciblé peut accepter.
  IF NOT EXISTS (
    SELECT 1 FROM public.personas WHERE id = v_target AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas répondre à cette demande.' USING ERRCODE = 'P0001';
  END IF;

  -- Un persona qui avait déjà un·e conjoint·e différent·e le "perd" : on
  -- nettoie le pointeur réciproque de l'ancien·ne conjoint·e pour éviter
  -- une relation fantôme à sens unique après le remariage.
  SELECT spouse_persona_id INTO v_old_requester_spouse FROM public.personas WHERE id = v_requester;
  SELECT spouse_persona_id INTO v_old_target_spouse FROM public.personas WHERE id = v_target;

  IF v_old_requester_spouse IS NOT NULL AND v_old_requester_spouse <> v_target THEN
    UPDATE public.personas SET spouse_persona_id = NULL, marital_status = 'divorced'
      WHERE id = v_old_requester_spouse AND spouse_persona_id = v_requester;
  END IF;
  IF v_old_target_spouse IS NOT NULL AND v_old_target_spouse <> v_requester THEN
    UPDATE public.personas SET spouse_persona_id = NULL, marital_status = 'divorced'
      WHERE id = v_old_target_spouse AND spouse_persona_id = v_target;
  END IF;

  UPDATE public.personas SET marital_status = v_requested_status, spouse_persona_id = v_target WHERE id = v_requester;
  UPDATE public.personas SET marital_status = v_requested_status, spouse_persona_id = v_requester WHERE id = v_target;

  DELETE FROM public.persona_marital_requests WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_marital_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_marital_request(UUID) TO authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- REVOKE ALL ON FUNCTION public.accept_marital_request(UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.accept_marital_request(UUID);
-- DROP TRIGGER IF EXISTS on_marital_request_notify ON public.persona_marital_requests;
-- DROP FUNCTION IF EXISTS public.notify_on_marital_request();
-- ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
-- ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
--   CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite', 'chatroom_reply', 'persona_new_chatroom', 'persona_reply'));
-- ALTER TABLE public.notification_preferences DROP CONSTRAINT notification_preferences_type_check;
-- ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_type_check
--   CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply', 'persona_new_chatroom', 'persona_reply'));
-- DROP TRIGGER IF EXISTS trg_enforce_marital_request_same_world ON public.persona_marital_requests;
-- DROP FUNCTION IF EXISTS public.enforce_marital_request_same_world();
-- DROP TABLE IF EXISTS public.persona_marital_requests;
