-- ============================================================
-- Migration 166 — Les liens entre deux lieux d'une carte
-- ============================================================
-- Une carte disait où sont les lieux, jamais ce qui les relie. Un lien joint
-- deux épingles : une route, une passe, une ligne de chemin de fer. Il porte
-- un nom, facultatif ; sa longueur ne se stocke pas — elle se déduit des
-- positions et de l'échelle de la carte (voir `scale.ts`), et suit donc les
-- épingles quand on les déplace.
--
-- `world_id` est gardé à côté de `map_id`, comme pour les épingles et les
-- régions : les politiques s'appuient dessus, et le temps réel filtre par
-- monde.
--
-- Le lien n'a pas de sens : « A rejoint B » et « B rejoint A » sont le même
-- trait. Plutôt qu'un index sur une expression, la paire est RANGÉE à
-- l'écriture — `from_pin_id < to_pin_id`, la contrainte le vérifie — et une
-- simple clé unique suffit alors à interdire le doublon dans l'autre sens.
-- C'est le serveur qui range (voir `createPinLink`) : la base ne fait que
-- refuser ce qui ne l'est pas.

CREATE TABLE IF NOT EXISTS public.world_map_pin_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  map_id      UUID NOT NULL REFERENCES public.world_maps(id) ON DELETE CASCADE,
  from_pin_id UUID NOT NULL REFERENCES public.world_map_pins(id) ON DELETE CASCADE,
  to_pin_id   UUID NOT NULL REFERENCES public.world_map_pins(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT world_map_pin_links_ordered CHECK (from_pin_id < to_pin_id),
  CONSTRAINT world_map_pin_links_pair_key UNIQUE (from_pin_id, to_pin_id),
  CONSTRAINT world_map_pin_links_label_len CHECK (char_length(label) <= 80)
);

-- Les liens d'une carte : c'est ainsi qu'ils sont lus, tous d'un coup.
CREATE INDEX IF NOT EXISTS world_map_pin_links_map_idx
  ON public.world_map_pin_links (map_id);

-- Ceux d'un lieu : c'est ainsi que sa fiche les lit. Rien pour `from_pin_id`,
-- que la clé unique indexe déjà en tête.
CREATE INDEX IF NOT EXISTS world_map_pin_links_to_idx
  ON public.world_map_pin_links (to_pin_id);

-- ── RLS : calquée sur les régions (migration 157) ────────────
ALTER TABLE public.world_map_pin_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "world_map_pin_links_read" ON public.world_map_pin_links;
CREATE POLICY "world_map_pin_links_read" ON public.world_map_pin_links FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_map_pin_links.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_map_pin_links.world_id AND m.user_id = (select auth.uid()))
);

DROP POLICY IF EXISTS "world_map_pin_links_write" ON public.world_map_pin_links;
CREATE POLICY "world_map_pin_links_write" ON public.world_map_pin_links FOR ALL USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_map_pin_links.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_map_pin_links.world_id AND m.user_id = (select auth.uid()) AND m.role IN ('admin','editor'))
);

-- ── `updated_at` ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS world_map_pin_links_updated_at ON public.world_map_pin_links;
CREATE TRIGGER world_map_pin_links_updated_at
  BEFORE UPDATE ON public.world_map_pin_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Temps réel ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'world_map_pin_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_map_pin_links;
  END IF;
END $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT policyname FROM pg_policies WHERE tablename = 'world_map_pin_links';
--   -- attendu : world_map_pin_links_read, world_map_pin_links_write
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.world_map_pin_links'::regclass AND contype IN ('c','u');
--   -- attendu : world_map_pin_links_ordered, world_map_pin_links_pair_key,
--   --           world_map_pin_links_label_len

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_map_pin_links;
-- DROP TABLE IF EXISTS public.world_map_pin_links;
