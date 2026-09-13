-- ============================================================
-- Migration 164 — Une icône Lucide sur un objet du catalogue
-- ============================================================
-- Le catalogue ne connaissait que `rpg_icons` : un jeu d'épées, de potions et
-- de boucliers. Il va aux objets, et va mal aux compétences — « Diplomatie »,
-- « Survie », « Alchimie » n'y trouvent rien. Lucide, lui, couvre l'abstrait.
--
-- ── Pourquoi une colonne de plus, et non un préfixe ──────────
-- `icon` porte un nom de fichier `rpg_icons` (« sword.svg »), `lucide_icon`
-- portera un nom Lucide en kebab-case (« swords »). Deux espaces de noms
-- distincts, donc deux colonnes : les mélanger dans une seule chaîne
-- demanderait un préfixe (« lucide:… ») que rien ne ferait respecter, et il
-- faudrait réécrire les valeurs existantes pour les distinguer.
--
-- Le reste du dépôt range d'ailleurs déjà un nom Lucide dans une colonne à
-- lui : `world_map_pins.icon`, `world_wiki_pages.icon`. La différence ici est
-- que le catalogue doit porter les DEUX.
--
-- ── Un seul visuel s'affiche ─────────────────────────────────
-- Trois sources possibles, une seule rendue, dans cet ordre :
--     image_url  >  lucide_icon  >  icon
-- L'ordre va du plus précis au plus générique — une image choisie pour CET
-- objet l'emporte sur une icône de bibliothèque. L'éditeur efface les autres
-- quand on en choisit une, si bien que la règle ne tranche presque jamais ;
-- elle existe pour que le rendu reste défini quoi qu'il arrive en base.
-- Voir `resolveCatalogEntry`, dans lib/worldCatalog.ts.

ALTER TABLE public.world_catalog_items
  ADD COLUMN IF NOT EXISTS lucide_icon TEXT;

-- Le plus long nom de la bibliothèque en fait une trentaine ; 100 laisse de
-- la marge sans laisser passer un texte déguisé en nom d'icône.
ALTER TABLE public.world_catalog_items
  ADD CONSTRAINT world_catalog_items_lucide_len CHECK (char_length(lucide_icon) <= 100);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'world_catalog_items' AND column_name = 'lucide_icon';

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_catalog_items DROP CONSTRAINT IF EXISTS world_catalog_items_lucide_len;
-- ALTER TABLE public.world_catalog_items DROP COLUMN IF EXISTS lucide_icon;
