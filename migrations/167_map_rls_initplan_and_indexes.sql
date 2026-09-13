-- ============================================================
-- Migration 167 — La carte : RLS par requête, index par lecture
-- ============================================================
-- Deux corrections mesurées sur les tables de la carte.
--
-- ── 1. `auth.uid()` évalué une fois, et non par ligne ────────
-- Une politique qui appelle `auth.uid()` directement le rappelle POUR CHAQUE
-- LIGNE examinée ; enveloppé dans un sous-select, Postgres le range en
-- InitPlan et ne l'évalue qu'une fois par requête. Le dépôt a déjà fait ce
-- passage deux fois (`rls_initplan_optimization`) ; trois politiques de la
-- carte y avaient échappé, dont la lecture des épingles — la plus sollicitée
-- de toutes (8 600 parcours d'index relevés en production).
--
-- Les conditions elles-mêmes ne changent pas d'un caractère : qui voit quoi
-- reste exactement ce qui était écrit.
--
-- ── 2. Des index qui suivent la lecture réelle ───────────────
-- `getWorldMaps` lit régions et liens PAR MONDE, toutes cartes confondues :
-- passer d'un onglet à l'autre est alors instantané. Or régions et liens
-- n'étaient indexés que par `map_id` — jamais interrogé de cette façon. Les
-- deux tables sont encore minuscules et Postgres les parcourt entièrement
-- sans y perdre ; ce sont les index de la lecture qui existe, posés avant
-- qu'elle coûte.
--
-- Les anciens index `map_id` sont laissés en place : les retirer est une
-- décision à part, et ils ne gênent qu'à l'écriture.

-- ── Épingles : lecture ───────────────────────────────────────
DROP POLICY IF EXISTS "world_map_pins_read" ON public.world_map_pins;
CREATE POLICY "world_map_pins_read" ON public.world_map_pins FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pins.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pins.world_id AND m.user_id = (select auth.uid()))
);

-- ── Régions : lecture et écriture ────────────────────────────
DROP POLICY IF EXISTS "world_map_regions_read" ON public.world_map_regions;
CREATE POLICY "world_map_regions_read" ON public.world_map_regions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_regions.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_regions.world_id AND m.user_id = (select auth.uid()))
);

DROP POLICY IF EXISTS "world_map_regions_write" ON public.world_map_regions;
CREATE POLICY "world_map_regions_write" ON public.world_map_regions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_regions.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_regions.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

-- ── Les index de la lecture par monde ────────────────────────
CREATE INDEX IF NOT EXISTS world_map_regions_world_idx
  ON public.world_map_regions (world_id, sort_index);

CREATE INDEX IF NOT EXISTS world_map_pin_links_world_idx
  ON public.world_map_pin_links (world_id);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT tablename, policyname,
--          qual LIKE '%( SELECT auth.uid()%' AS initplan
--     FROM pg_policies
--    WHERE tablename LIKE 'world_map%';
--   -- attendu : initplan = true partout

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Les politiques d'avant sont identiques, `(select auth.uid())` en moins.
-- DROP INDEX IF EXISTS public.world_map_regions_world_idx;
-- DROP INDEX IF EXISTS public.world_map_pin_links_world_idx;
