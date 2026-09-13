-- ============================================================
-- Migration 168 — La carte : une seule politique par lecture
-- ============================================================
-- Chaque table de la carte portait DEUX politiques permissives pour SELECT :
-- `_read`, écrite pour ça, et `_write` en `FOR ALL` — qui couvre aussi la
-- lecture. Postgres les évalue toutes les deux, par ligne, et retient leur
-- OU. La seconde ne pouvait rien ajouter : un propriétaire ou un membre
-- `admin`/`editor` est toujours un membre, donc `_write` est INCLUS dans
-- `_read`. On payait une évaluation par ligne pour une réponse déjà connue.
--
-- Chaque `_write` se scinde donc en trois politiques, une par action qui
-- écrit. La condition ne change pas d'un caractère ; c'est sa portée qui se
-- réduit à ce qu'elle servait vraiment.
--
-- ── Ce que `FOR ALL` faisait, et qu'il faut redire ───────────
-- Sans `WITH CHECK`, `USING` sert AUSSI de contrôle pour les lignes insérées
-- ou modifiées. En scindant, il faut donc l'écrire à la main : l'omettre
-- laisserait un éditeur poser une ligne dans un monde qui n'est pas le sien.
--
-- Les advisors de Supabase signalent ce motif 90 fois dans le dépôt ; ces
-- quatre tables-ci sont celles de la carte.

-- ── Cartes ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "world_maps_write" ON public.world_maps;

CREATE POLICY "world_maps_insert" ON public.world_maps FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_maps.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_maps.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_maps_update" ON public.world_maps FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_maps.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_maps.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_maps.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_maps.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_maps_delete" ON public.world_maps FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_maps.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_maps.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

-- ── Épingles ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "world_map_pins_write" ON public.world_map_pins;

CREATE POLICY "world_map_pins_insert" ON public.world_map_pins FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pins.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pins.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_map_pins_update" ON public.world_map_pins FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pins.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pins.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pins.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pins.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_map_pins_delete" ON public.world_map_pins FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pins.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pins.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

-- ── Régions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "world_map_regions_write" ON public.world_map_regions;

CREATE POLICY "world_map_regions_insert" ON public.world_map_regions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_regions.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_regions.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_map_regions_update" ON public.world_map_regions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_regions.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_regions.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_regions.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_regions.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_map_regions_delete" ON public.world_map_regions FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_regions.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_regions.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

-- ── Liens entre lieux ─────────────────────────────────────────
DROP POLICY IF EXISTS "world_map_pin_links_write" ON public.world_map_pin_links;

CREATE POLICY "world_map_pin_links_insert" ON public.world_map_pin_links FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pin_links.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pin_links.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_map_pin_links_update" ON public.world_map_pin_links FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pin_links.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pin_links.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pin_links.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pin_links.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

CREATE POLICY "world_map_pin_links_delete" ON public.world_map_pin_links FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.worlds w
           WHERE w.id = world_map_pin_links.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m
              WHERE m.world_id = world_map_pin_links.world_id AND m.user_id = (select auth.uid())
                AND m.role IN ('admin','editor'))
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT tablename, count(*) FILTER (WHERE cmd = 'SELECT') AS lectures
--     FROM pg_policies WHERE tablename LIKE 'world_map%' GROUP BY tablename;
--   -- attendu : une seule politique de lecture par table

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Recréer chaque `_write` en `FOR ALL USING (<même condition>)`, et
-- supprimer les douze politiques ci-dessus.
