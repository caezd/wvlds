-- ─────────────────────────────────────────────────────────────
-- Migration 195 — Une suite ne remonte pas le temps
--
-- Un salon ne peut faire suite qu'à un salon situé au plus tard à sa propre
-- date sur la chronologie : relier un salon à un autre qui vient après lui
-- casserait l'ordre du récit. La comparaison suit celle de la frise
-- (`compareTimelineDates`, lib/worldTimeline.ts) : l'année d'abord, puis le
-- mois et le jour quand les deux dates les donnent — une date sans mois ne
-- contredit aucune date de la même année. Un salon sans date ne se compare
-- à rien.
-- ─────────────────────────────────────────────────────────────

-- `a` vient-elle strictement après `b` ?
CREATE OR REPLACE FUNCTION public.timeline_date_after(a jsonb, b jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL OR jsonb_typeof(a->'year') <> 'number' OR jsonb_typeof(b->'year') <> 'number' THEN false
    WHEN (a->>'year')::numeric <> (b->>'year')::numeric THEN (a->>'year')::numeric > (b->>'year')::numeric
    WHEN jsonb_typeof(a->'month') <> 'number' OR jsonb_typeof(b->'month') <> 'number' THEN false
    WHEN (a->>'month')::numeric <> (b->>'month')::numeric THEN (a->>'month')::numeric > (b->>'month')::numeric
    WHEN jsonb_typeof(a->'day') <> 'number' OR jsonb_typeof(b->'day') <> 'number' THEN false
    ELSE (a->>'day')::numeric > (b->>'day')::numeric
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_chatroom_sequel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_world   uuid;
  v_loop    boolean;
  v_date    jsonb;
  v_prev    jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.world_id, c.timeline_date INTO v_world, v_date FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
    SELECT c.timeline_date INTO v_prev FROM public.chatrooms c WHERE c.id = NEW.previous_id AND c.world_id = v_world;
    IF v_world IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.chatrooms c WHERE c.id = NEW.previous_id AND c.world_id = v_world
    ) THEN
      RAISE EXCEPTION 'Un salon ne fait suite qu''à un salon du même monde.';
    END IF;
    IF public.timeline_date_after(v_prev, v_date) THEN
      RAISE EXCEPTION 'Un salon ne fait pas suite à un salon situé après lui sur la chronologie.';
    END IF;
    NEW.world_id := v_world;

    WITH RECURSIVE ancetres(id) AS (
      SELECT NEW.previous_id
      UNION
      SELECT s.previous_id FROM public.chatroom_sequels s JOIN ancetres a ON s.chatroom_id = a.id
    )
    SELECT EXISTS (SELECT 1 FROM ancetres WHERE id = NEW.chatroom_id) INTO v_loop;
    IF v_loop THEN
      RAISE EXCEPTION 'Cette suite formerait une boucle.';
    END IF;

    IF v_uid IS NOT NULL THEN
      NEW.created_by := v_uid;
      IF public.can_manage_chatroom_sequels(v_world, v_uid) OR public.is_chatroom_participant(NEW.previous_id, v_uid) THEN
        NEW.status := 'accepted';
        NEW.accepted_by := v_uid;
        NEW.accepted_at := now();
      ELSE
        NEW.status := 'pending';
        NEW.accepted_by := NULL;
        NEW.accepted_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  NEW.world_id := OLD.world_id;
  NEW.chatroom_id := OLD.chatroom_id;
  NEW.previous_id := OLD.previous_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'accepted' THEN
    NEW.status := 'accepted';
    NEW.accepted_by := OLD.accepted_by;
    NEW.accepted_at := OLD.accepted_at;
  ELSIF NEW.status = 'accepted' THEN
    NEW.accepted_by := COALESCE(v_uid, NEW.accepted_by);
    NEW.accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_chatroom_sequel() FROM PUBLIC, anon, authenticated;
