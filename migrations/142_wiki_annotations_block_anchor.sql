-- ============================================================
-- Migration 142 — Ancrage d'un commentaire de wiki sur un bloc
-- ============================================================
-- Un commentaire visait jusqu'ici une sélection de caractères. Il vise
-- désormais un **bloc** du texte rendu — paragraphe, élément de liste,
-- citation, titre —, ce qui le rend insensible à l'insertion et au
-- déplacement d'autres blocs : ni l'un ni l'autre ne change le texte de celui
-- qui est commenté.
--
-- Les colonnes existantes portent l'ancre, à une granularité près :
--
--   anchor_quote  → le texte du bloc (borné à 1000 caractères comme avant)
--   anchor_prefix → la fin du bloc précédent
--   anchor_suffix → le début du bloc suivant
--   anchor_start  → l'index du bloc, et non plus une position en caractères
--
-- Une seule colonne s'ajoute : le **type** du bloc. Renseignée, l'ancre est
-- une ancre de bloc ; nulle, c'est une ancre de sélection, résolue comme
-- auparavant. Aucune donnée n'est donc à convertir — les commentaires
-- existants restent résolus par leur extrait, et l'interface les rattache au
-- bloc qui les contient au moment du rendu.
--
-- Pas d'identifiant écrit dans le markdown : l'article s'édite maintenant en
-- source brute, un marqueur y serait visible, effaçable, et surtout
-- duplicable d'un copier-coller — deux blocs porteraient la même identité et
-- un commentaire irait se poser sur le mauvais, en silence.

ALTER TABLE public.world_wiki_page_annotations
  ADD COLUMN IF NOT EXISTS anchor_block_type TEXT;

-- Le type reste dans la liste des blocs que le rendu produit : une valeur
-- fantaisiste ne résoudrait jamais et laisserait un commentaire détaché sans
-- qu'on sache pourquoi.
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_anchor_block_type CHECK (
    anchor_block_type IS NULL
    OR anchor_block_type IN ('p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'td')
  );

-- Une réponse ne porte aucune ancre : le type de bloc suit la même règle que
-- les quatre colonnes que `wwpa_anchor_shape` tient déjà.
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_anchor_block_on_root CHECK (
    parent_id IS NULL OR anchor_block_type IS NULL
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'world_wiki_page_annotations' AND column_name = 'anchor_block_type';
--     -- anchor_block_type | text
--
--   -- Une réponse ne peut pas porter de type de bloc :
--   INSERT INTO public.world_wiki_page_annotations (page_id, world_id, parent_id, author_id, body, anchor_block_type)
--   VALUES ('...', '...', '...', auth.uid(), 'test', 'p');
--     -- ERROR: new row violates check constraint "wwpa_anchor_block_on_root"

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_wiki_page_annotations DROP CONSTRAINT IF EXISTS wwpa_anchor_block_on_root;
-- ALTER TABLE public.world_wiki_page_annotations DROP CONSTRAINT IF EXISTS wwpa_anchor_block_type;
-- ALTER TABLE public.world_wiki_page_annotations DROP COLUMN IF EXISTS anchor_block_type;
