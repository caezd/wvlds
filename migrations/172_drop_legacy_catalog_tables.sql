-- ============================================================
-- Migration 172 — Fin de la reprise du catalogue
-- ============================================================
-- La migration 161 a réuni `world_inventory_items` et `world_skills` dans
-- `world_catalog_items`, en gardant les deux tables d'origine le temps que le
-- code qui y écrivait soit remplacé. La PR #68 l'a remplacé, fusionnée dans
-- `main` et déployée en production le 2026-09-13. Cette migration ferme la
-- fenêtre en trois temps, dans un ordre qui compte.
--
-- État relevé avant suppression (2026-09-13) :
--   world_inventory_items    1 ligne, dernière écriture le 2026-06-18
--   world_skills             3 lignes, dernière écriture le 2026-06-18
--   world_catalog_items      6 lignes ; les 4 anciennes y sont, identiques
--   référencées par          rien — ni clé étrangère, ni fonction, ni vue ;
--                            seules leurs politiques RLS, qui partent avec
--   image_url non http(s)    aucune
--
-- ── 1. Rejouer la copie ──────────────────────────────────────
-- Entre l'application de la 161 et le déploiement, l'ancien code a pu écrire
-- dans les anciennes tables. Les deux INSERT de la 161 sont rejoués tels quels
-- (`ON CONFLICT DO NOTHING`) : ce qui est déjà passé n'est ni doublé ni
-- écrasé, ce qui manquerait arrive. Relevé nul aujourd'hui — mais la
-- migration doit rester juste si elle est appliquée plus tard.
--
-- ── 2. Borner l'URL d'image ──────────────────────────────────
-- La 171 a posé `is_http_url` sur quatorze colonnes d'URL, mais ne connaissait
-- pas `world_catalog_items.image_url`, née en 161 sur une autre branche. Le
-- serveur la vérifie déjà (`catalogItemSchema`) ; la base doit le faire aussi,
-- pour la même raison que partout ailleurs : la RLS dit qui écrit, jamais quoi,
-- et un appel direct à PostgREST passe à côté du serveur.
--
-- ── 3. Supprimer ─────────────────────────────────────────────
-- Après la copie, jamais avant : un DROP en premier perdrait ce que l'étape 1
-- vient récupérer. La table `world_catalog_categories` n'est pas touchée,
-- elle sert toujours.

-- ── 1. Reprise de ce qui aurait été écrit entre-temps ────────
INSERT INTO public.world_catalog_items (id, world_id, type, category_id, name, description, icon, sort_index, created_at)
SELECT id, world_id, 'inventory', category_id, name, description, icon, sort_index, created_at
  FROM public.world_inventory_items
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.world_catalog_items (id, world_id, type, category_id, name, description, icon, sort_index, created_at)
SELECT id, world_id, 'skills', category_id, name, description, icon, sort_index, created_at
  FROM public.world_skills
ON CONFLICT (id) DO NOTHING;

-- ── 2. L'URL d'image en http(s), comme les autres ────────────
-- `is_http_url(NULL)` est vrai : un objet sans image reste valide.
ALTER TABLE public.world_catalog_items
  ADD CONSTRAINT world_catalog_items_image_url_http CHECK (public.is_http_url(image_url));

-- ── 3. Les anciennes tables ──────────────────────────────────
DROP TABLE IF EXISTS public.world_inventory_items;
DROP TABLE IF EXISTS public.world_skills;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('world_inventory_items','world_skills');       -- → 0
-- SELECT conname FROM pg_constraint
--  WHERE conrelid='public.world_catalog_items'::regclass
--    AND conname='world_catalog_items_image_url_http';                 -- → 1 ligne
-- SELECT type, count(*) FROM public.world_catalog_items GROUP BY type;
--   -- attendu : au moins les comptes des anciennes tables relevés plus haut

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_catalog_items DROP CONSTRAINT IF EXISTS world_catalog_items_image_url_http;
-- Les tables supprimées ne se recréent pas avec leur contenu : leurs lignes
-- vivent dans `world_catalog_items`, avec leurs identifiants. Les recréer
-- vides ne servirait qu'à un code qui n'existe plus (voir la 161 pour leur
-- structure, et la 012 pour leurs politiques).
