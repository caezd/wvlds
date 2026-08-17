-- ============================================================
-- Migration 111 — Lexique du monde
-- ============================================================
-- Termes propres à un univers, définis par un éditeur du monde, mis en
-- évidence automatiquement dans tout le contenu du wiki (voir
-- lib/lexiconHighlight.ts) avec leur description affichée au clic.

CREATE TABLE IF NOT EXISTS public.world_lexicon_terms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  term        TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS world_lexicon_terms_world_id_idx
  ON public.world_lexicon_terms (world_id);

-- Un seul terme par monde, insensible à la casse (évite "Dragon" et "dragon"
-- comme deux entrées distinctes qui se disputeraient le même highlight).
CREATE UNIQUE INDEX IF NOT EXISTS world_lexicon_terms_world_term_idx
  ON public.world_lexicon_terms (world_id, lower(term));

ALTER TABLE public.world_lexicon_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wlt_select" ON public.world_lexicon_terms
  FOR SELECT USING (is_world_member(world_id, auth.uid()));

CREATE POLICY "wlt_insert" ON public.world_lexicon_terms
  FOR INSERT WITH CHECK (is_world_editor(world_id, auth.uid()));

CREATE POLICY "wlt_update" ON public.world_lexicon_terms
  FOR UPDATE USING (is_world_editor(world_id, auth.uid()));

CREATE POLICY "wlt_delete" ON public.world_lexicon_terms
  FOR DELETE USING (is_world_editor(world_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.world_lexicon_terms;

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_lexicon_terms;
-- DROP TABLE IF EXISTS public.world_lexicon_terms;
