-- ============================================================
-- Migration 161 — Un seul catalogue : `world_catalog_items`
-- ============================================================
-- `world_inventory_items` et `world_skills` sont deux tables jumelles : mêmes
-- colonnes, mêmes contraintes, mêmes quatre policies, à la lettre près. Cette
-- gémellité se propageait à tout ce qui les touche — deux jeux d'actions
-- serveur, deux composants de champ, deux requêtes de chargement — et chaque
-- ajout se payait deux fois. `world_catalog_categories` avait déjà tranché
-- autrement : une seule table, une colonne `type`. Les objets la rejoignent.
--
-- ── Les identifiants sont CONSERVÉS ──────────────────────────
-- La fiche d'un persona range son inventaire en JSONB et désigne l'objet du
-- catalogue par son `catalog_id`. Réattribuer des identifiants à la copie
-- couperait ce lien pour toutes les fiches existantes : l'INSERT reprend donc
-- `id` tel quel. Les deux tables sources ne peuvent pas se marcher dessus,
-- leurs identifiants sont des UUID tirés au sort.
--
-- ── Les colonnes nouvelles ───────────────────────────────────
-- Un objet ne se résumait qu'à un nom, une description et une icône du jeu
-- `rpg_icons`. S'ajoutent :
--   `image_url`    une image propre au monde, à la place de l'icône
--   `rarity`       cinq degrés, rendus par une couleur côté client
--   `stackable`    un objet unique ne s'empile pas
--   `max_quantity` plafond par fiche, NULL = pas de plafond
--   `properties`   couples libres `{label, value}` — poids, portée, prérequis…
-- `stackable` et `max_quantity` ne veulent rien dire pour une compétence ;
-- elles y gardent leur défaut et l'interface ne les propose pas. C'est le prix
-- de la table unique, et il est moindre que celui de la duplication.
--
-- ── Les anciennes tables restent ─────────────────────────────
-- Elles sont conservées le temps que le déploiement passe : entre l'application
-- de cette migration et la mise en ligne du code, l'ancien code écrit encore
-- dedans. Une migration ultérieure les supprimera, une fois le déploiement
-- fait — même marche que pour `chatroom_reads` (migration 118).

CREATE TABLE IF NOT EXISTS public.world_catalog_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     UUID        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('inventory', 'skills')),
  category_id  UUID        REFERENCES public.world_catalog_categories(id) ON DELETE SET NULL,
  name         TEXT        NOT NULL,
  description  TEXT,
  icon         TEXT,
  image_url    TEXT,
  rarity       TEXT        CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  stackable    BOOLEAN     NOT NULL DEFAULT TRUE,
  max_quantity INTEGER     CHECK (max_quantity IS NULL OR max_quantity > 0),
  properties   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  sort_index   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Bornes de longueur : la RLS dit qui écrit, jamais quoi (migration 126).
  CONSTRAINT world_catalog_items_name_len   CHECK (char_length(name)        <= 200),
  CONSTRAINT world_catalog_items_desc_len   CHECK (char_length(description) <= 5000),
  CONSTRAINT world_catalog_items_icon_len   CHECK (char_length(icon)        <= 200),
  CONSTRAINT world_catalog_items_image_len  CHECK (char_length(image_url)   <= 2000),
  -- Un tableau, et pas cinquante entrées : `properties` sert à décrire un
  -- objet, pas à stocker des données arbitraires dans une colonne JSONB.
  CONSTRAINT world_catalog_items_props_shape CHECK (
    jsonb_typeof(properties) = 'array' AND jsonb_array_length(properties) <= 20
  )
);

-- La lecture se fait toujours par monde et par type, dans l'ordre d'affichage.
CREATE INDEX IF NOT EXISTS world_catalog_items_world_type_idx
  ON public.world_catalog_items (world_id, type, sort_index);

-- Le décompte d'usage et la suppression d'une catégorie passent par là.
CREATE INDEX IF NOT EXISTS world_catalog_items_category_idx
  ON public.world_catalog_items (category_id)
  WHERE category_id IS NOT NULL;

DROP TRIGGER IF EXISTS world_catalog_items_touch ON public.world_catalog_items;
CREATE TRIGGER world_catalog_items_touch
  BEFORE UPDATE ON public.world_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS : reprise mot pour mot de celle des tables d'origine ──
-- `is_world_editor` ne regarde que `world_members` : le propriétaire d'un monde
-- n'y a pas forcément de ligne. Les deux conditions sont donc écrites en clair,
-- comme dans les migrations 012 et 157, plutôt que déléguées à l'assistant.
ALTER TABLE public.world_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "world_catalog_items_read" ON public.world_catalog_items;
CREATE POLICY "world_catalog_items_read" ON public.world_catalog_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id AND m.user_id = (select auth.uid()))
);

DROP POLICY IF EXISTS "world_catalog_items_write" ON public.world_catalog_items;
CREATE POLICY "world_catalog_items_write" ON public.world_catalog_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id AND m.user_id = (select auth.uid()) AND m.role IN ('admin', 'editor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id AND m.user_id = (select auth.uid()) AND m.role IN ('admin', 'editor'))
);

-- ── Reprise des données ──────────────────────────────────────
-- `ON CONFLICT DO NOTHING` rend la migration rejouable : la relancer ne
-- dédouble rien et n'écrase pas ce qui aurait été modifié entre-temps.
INSERT INTO public.world_catalog_items (id, world_id, type, category_id, name, description, icon, sort_index, created_at)
SELECT id, world_id, 'inventory', category_id, name, description, icon, sort_index, created_at
  FROM public.world_inventory_items
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.world_catalog_items (id, world_id, type, category_id, name, description, icon, sort_index, created_at)
SELECT id, world_id, 'skills', category_id, name, description, icon, sort_index, created_at
  FROM public.world_skills
ON CONFLICT (id) DO NOTHING;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT type, count(*) FROM public.world_catalog_items GROUP BY type;
--   -- attendu : autant de lignes que dans world_inventory_items / world_skills
--   SELECT policyname FROM pg_policies WHERE tablename = 'world_catalog_items';
--   -- attendu : world_catalog_items_read, world_catalog_items_write

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.world_catalog_items;
