-- ============================================================
-- Migration 139 — Notes d'une page de wiki, rangées par catégories
-- ============================================================
-- Le complément d'un article : une vue d'ensemble, des fiches d'entités, de
-- relations, de lieux, de moments… Contrairement aux annotations de la
-- migration 137, ces notes ne sont attachées à AUCUN passage du texte. Elles
-- accompagnent la page entière, dans un panneau à part.
--
-- Catégories ET fiches appartiennent à une page, pas au monde : deux articles
-- n'ont pas la même ossature, et rien ne dit qu'une fiche de personnage vaille
-- pour tout l'univers — le lexique du monde et les personas remplissent déjà
-- ce rôle-là.
--
-- L'écriture est réservée aux éditeurs : ce sont des éléments de l'article,
-- pas des contributions de lecteurs. La lecture, elle, suit la visibilité de
-- la page, comme pour les annotations.

CREATE TABLE IF NOT EXISTS public.world_wiki_page_note_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID NOT NULL REFERENCES public.world_wiki_pages(id) ON DELETE CASCADE,
  world_id   UUID NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.world_wiki_page_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.world_wiki_page_note_categories(id) ON DELETE CASCADE,
  -- Dénormalisé depuis la catégorie : le panneau lit « toutes les notes de
  -- cette page » d'une seule requête, sans jointure, et la RLS s'en sert.
  -- La cohérence avec la catégorie est vérifiée à l'écriture (voir plus bas).
  page_id     UUID NOT NULL REFERENCES public.world_wiki_pages(id) ON DELETE CASCADE,
  world_id    UUID NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  sort_index  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Cohérence des lignes ─────────────────────────────────────
ALTER TABLE public.world_wiki_page_note_categories
  ADD CONSTRAINT wwpnc_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE public.world_wiki_page_notes
  ADD CONSTRAINT wwpn_title_not_blank CHECK (btrim(title) <> '');

-- ── Bornes de longueur ───────────────────────────────────────
-- Voir migration 126. Reportées dans `lib/textLimits.ts`, dont un test refuse
-- toute divergence.
ALTER TABLE public.world_wiki_page_note_categories
  ADD CONSTRAINT wwpnc_name_len CHECK (char_length(name) <= 200);
ALTER TABLE public.world_wiki_page_notes
  ADD CONSTRAINT wwpn_title_len CHECK (char_length(title) <= 200);
ALTER TABLE public.world_wiki_page_notes
  ADD CONSTRAINT wwpn_body_len CHECK (char_length(body) <= 5000);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS wwpnc_page_sort_idx
  ON public.world_wiki_page_note_categories (page_id, sort_index);

CREATE INDEX IF NOT EXISTS wwpn_category_sort_idx
  ON public.world_wiki_page_notes (category_id, sort_index);

-- Le panneau charge les notes par page, pas par catégorie : sans cet index,
-- cette lecture-là parcourt toute la table.
CREATE INDEX IF NOT EXISTS wwpn_page_idx
  ON public.world_wiki_page_notes (page_id);

-- ── updated_at ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'world_wiki_page_note_categories_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER world_wiki_page_note_categories_updated_at
      BEFORE UPDATE ON public.world_wiki_page_note_categories
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'world_wiki_page_notes_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER world_wiki_page_notes_updated_at
      BEFORE UPDATE ON public.world_wiki_page_notes
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── RLS : catégories ─────────────────────────────────────────
ALTER TABLE public.world_wiki_page_note_categories ENABLE ROW LEVEL SECURITY;

-- Lecture déléguée à la RLS des pages, comme pour les annotations : l'EXISTS
-- ne rend une ligne que si le lecteur a le droit de voir la page. Une seule
-- définition de « qui voit quoi », qui vit dans `world_wiki_pages`.
DROP POLICY IF EXISTS "wwpnc_select" ON public.world_wiki_page_note_categories;
CREATE POLICY "wwpnc_select" ON public.world_wiki_page_note_categories
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.world_wiki_pages p WHERE p.id = page_id));

DROP POLICY IF EXISTS "wwpnc_insert" ON public.world_wiki_page_note_categories;
CREATE POLICY "wwpnc_insert" ON public.world_wiki_page_note_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND is_world_editor(world_id, (select auth.uid()))
  );

-- Le WITH CHECK est écrit en toutes lettres plutôt que laissé à la valeur du
-- USING : sans lui, un éditeur pourrait déplacer une catégorie vers la page
-- d'un monde où il n'a aucun droit, la condition du USING restant vraie sur
-- l'ancienne ligne.
DROP POLICY IF EXISTS "wwpnc_update" ON public.world_wiki_page_note_categories;
CREATE POLICY "wwpnc_update" ON public.world_wiki_page_note_categories
  FOR UPDATE TO authenticated
  USING (is_world_editor(world_id, (select auth.uid())))
  WITH CHECK (
    world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND is_world_editor(world_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "wwpnc_delete" ON public.world_wiki_page_note_categories;
CREATE POLICY "wwpnc_delete" ON public.world_wiki_page_note_categories
  FOR DELETE TO authenticated
  USING (is_world_editor(world_id, (select auth.uid())));

-- ── RLS : notes ──────────────────────────────────────────────
ALTER TABLE public.world_wiki_page_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wwpn_select" ON public.world_wiki_page_notes;
CREATE POLICY "wwpn_select" ON public.world_wiki_page_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.world_wiki_pages p WHERE p.id = page_id));

-- `page_id` doit être celui de la page ET celui de la catégorie : c'est ce
-- second test qui empêche de ranger une note dans la catégorie d'un autre
-- article, ce que le glisser-déposer rendrait sinon trivial à provoquer.
DROP POLICY IF EXISTS "wwpn_insert" ON public.world_wiki_page_notes;
CREATE POLICY "wwpn_insert" ON public.world_wiki_page_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND page_id = (SELECT c.page_id FROM public.world_wiki_page_note_categories c WHERE c.id = category_id)
    AND is_world_editor(world_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "wwpn_update" ON public.world_wiki_page_notes;
CREATE POLICY "wwpn_update" ON public.world_wiki_page_notes
  FOR UPDATE TO authenticated
  USING (is_world_editor(world_id, (select auth.uid())))
  WITH CHECK (
    world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND page_id = (SELECT c.page_id FROM public.world_wiki_page_note_categories c WHERE c.id = category_id)
    AND is_world_editor(world_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "wwpn_delete" ON public.world_wiki_page_notes;
CREATE POLICY "wwpn_delete" ON public.world_wiki_page_notes
  FOR DELETE TO authenticated
  USING (is_world_editor(world_id, (select auth.uid())));

-- ── Temps réel ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'world_wiki_page_note_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_wiki_page_note_categories;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'world_wiki_page_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_wiki_page_notes;
  END IF;
END $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT count(*) FROM pg_policies
--    WHERE tablename IN ('world_wiki_page_note_categories', 'world_wiki_page_notes');  -- 8
-- Sous le rôle anon, les deux tables doivent rester vides.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_wiki_page_notes;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_wiki_page_note_categories;
-- DROP TABLE IF EXISTS public.world_wiki_page_notes;
-- DROP TABLE IF EXISTS public.world_wiki_page_note_categories;
