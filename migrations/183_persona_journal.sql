-- ============================================================
-- Migration 183 — Journal de bord des personas
-- ============================================================
-- Un persona vit dans les salons, mais rien ne garde la trace de ce qu'il en
-- retient : où il en est, ce qu'il a appris, ce qu'il pense de la veille.
-- Le journal est cette suite d'entrées, écrites par qui joue le persona
-- (`owns_persona` : son propriétaire, ou un joueur de PNJ) et lues par tous
-- les membres du monde — un journal privé n'a pas été retenu.
--
-- Chaque entrée peut se dater dans la chronologie du monde (même forme JSON
-- que `chatrooms.timeline_date`, migration 040 : `{year, month, day}`, mois
-- et jour facultatifs) ; sans date fictive, la date réelle d'écriture fait
-- l'ordre. `world_id` est recopié du persona pour la politique de lecture,
-- et vérifié à l'écriture.

CREATE TABLE IF NOT EXISTS public.persona_journal_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id    uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  world_id      uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  author_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body          text NOT NULL,
  timeline_date jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_journal_entries_body_nonempty CHECK (btrim(body) <> ''),
  CONSTRAINT persona_journal_entries_timeline_date_shape CHECK (
    timeline_date IS NULL
    OR (jsonb_typeof(timeline_date) = 'object' AND jsonb_typeof(timeline_date->'year') = 'number')
  )
);
ALTER TABLE public.persona_journal_entries ADD CONSTRAINT persona_journal_entries_body_len CHECK (char_length(body) <= 5000);
CREATE INDEX IF NOT EXISTS persona_journal_entries_persona_idx ON public.persona_journal_entries (persona_id, created_at DESC);

-- `world_id` suit toujours le persona ; `updated_at` suit l'écriture.
CREATE OR REPLACE FUNCTION public.tg_persona_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_world uuid;
BEGIN
  SELECT p.world_id INTO v_world FROM public.personas p WHERE p.id = NEW.persona_id;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Un journal n''existe que pour un persona d''un monde.';
  END IF;
  NEW.world_id := v_world;
  IF TG_OP = 'UPDATE' THEN
    NEW.persona_id := OLD.persona_id;
    NEW.author_id := OLD.author_id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_journal_entry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_persona_journal_entry ON public.persona_journal_entries;
CREATE TRIGGER trg_persona_journal_entry
  BEFORE INSERT OR UPDATE ON public.persona_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_journal_entry();

ALTER TABLE public.persona_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persona_journal_entries_select" ON public.persona_journal_entries FOR SELECT TO authenticated USING (
  public.is_world_member(world_id, (select auth.uid()))
);
CREATE POLICY "persona_journal_entries_insert" ON public.persona_journal_entries FOR INSERT TO authenticated WITH CHECK (
  author_id = (select auth.uid())
  AND public.owns_persona(persona_id, (select auth.uid()))
);
CREATE POLICY "persona_journal_entries_update" ON public.persona_journal_entries FOR UPDATE TO authenticated USING (
  public.owns_persona(persona_id, (select auth.uid()))
) WITH CHECK (
  public.owns_persona(persona_id, (select auth.uid()))
);
CREATE POLICY "persona_journal_entries_delete" ON public.persona_journal_entries FOR DELETE TO authenticated USING (
  public.owns_persona(persona_id, (select auth.uid()))
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- En tant que propriétaire : INSERT INTO persona_journal_entries (persona_id, world_id, author_id, body)
--   VALUES (<mien>, '00000000-0000-0000-0000-000000000000', auth.uid(), 'Jour 1') → world_id recopié du persona.
-- En tant qu'autre membre : SELECT → l'entrée ; INSERT sur ce persona → refusé.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE public.persona_journal_entries; DROP FUNCTION public.tg_persona_journal_entry();
