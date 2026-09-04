-- ============================================================
-- Migration 154 — Un persona se trouve quelque part sur la carte
-- ============================================================
-- « Qui est à la taverne en ce moment ? » — la carte ne savait pas répondre.
-- Un persona peut désormais se poser sur un lieu ; la carte montre qui est
-- là, et le panneau d'un lieu liste ses occupants.
--
-- Une colonne sur `personas`, et non une table de positions : un persona est
-- déjà lié à un monde (migration 008), et une position à la fois suffit.
-- L'historique des déplacements se fera le jour où quelqu'un le demandera.
--
-- `ON DELETE SET NULL` : supprimer un lieu ne supprime pas ceux qui s'y
-- trouvaient. Ils redeviennent simplement sans adresse.
--
-- Aucune policy à écrire : le propriétaire d'un persona peut déjà le modifier
-- (`personas_update_own`), et les membres d'un monde lire ses personas
-- (`personas_readable_by_world_members`). Qui peut poser un persona et qui
-- peut le voir sur la carte découle des règles existantes.

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS map_pin_id UUID
    REFERENCES public.world_map_pins(id) ON DELETE SET NULL;

-- Les occupants d'un lieu, et la liste de tous les personas placés d'un monde.
CREATE INDEX IF NOT EXISTS personas_map_pin_idx
  ON public.personas (map_pin_id)
  WHERE map_pin_id IS NOT NULL;

-- ── Le temps réel de la carte, enfin branché ─────────────────
-- Découvert en préparant cette migration : la publication `supabase_realtime`
-- ne contenait ni `world_maps` ni `world_map_pins`. Le composant y souscrivait
-- depuis sa première version — sans jamais recevoir un événement. Une épingle
-- posée par un autre n'apparaissait qu'au rechargement.
--
-- `personas` y est déjà : les déplacements se verront sans rien ajouter.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'world_maps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_maps;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'world_map_pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_map_pins;
  END IF;
END $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime'
--      AND tablename IN ('world_maps', 'world_map_pins', 'personas');
--   -- attendu : les trois

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_maps, public.world_map_pins;
-- DROP INDEX IF EXISTS public.personas_map_pin_idx;
-- ALTER TABLE public.personas DROP COLUMN IF EXISTS map_pin_id;
