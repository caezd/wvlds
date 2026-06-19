-- 012_world_catalog.sql
-- Catalogue d'objets et de compétences par monde

-- ── Colonnes de restriction sur worlds ────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS restrict_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restrict_skills    BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Catalogue d'objets d'inventaire ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_inventory_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_index  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.world_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wii_select" ON public.world_inventory_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_inventory_items.world_id AND user_id = auth.uid())
  );

CREATE POLICY "wii_insert" ON public.world_inventory_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_inventory_items.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "wii_update" ON public.world_inventory_items FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_inventory_items.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_inventory_items.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "wii_delete" ON public.world_inventory_items FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_inventory_items.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  );

-- ── Catalogue de compétences ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_skills (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_index  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.world_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select" ON public.world_skills FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_skills.world_id AND user_id = auth.uid())
  );

CREATE POLICY "ws_insert" ON public.world_skills FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_skills.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "ws_update" ON public.world_skills FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_skills.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_skills.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  );

CREATE POLICY "ws_delete" ON public.world_skills FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.worlds WHERE id = world_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members WHERE world_id = world_skills.world_id AND user_id = auth.uid() AND role IN ('admin', 'editor'))
  );
