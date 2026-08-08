-- ============================================================
-- Migration 098 — Wiki : cascade de renommage + rétention d'historique
-- ============================================================
-- Deux suites données à la refonte du wiki (095-097) :
--  - un lien interne [[Ancien titre]] cassait silencieusement au
--    renommage de la page ciblée. wwp_rename_cascade() réécrit ces liens
--    dans toutes les pages du même monde (contenu publié ET brouillon) au
--    même titre — c'est une correction syntaxique du lien, pas une
--    modification de fond, d'où l'exception à la séparation
--    brouillon/publié habituelle.
--  - l'historique des versions n'avait aucune purge. On garde désormais
--    les WWP_VERSION_RETENTION dernières versions par page ; volumétrie
--    négligeable pour un wiki de monde, mais évite une croissance non
--    bornée sur une page publiée très fréquemment.

-- ── 1. Cascade de renommage ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.wwp_rename_cascade(
  p_world_id UUID,
  p_old_title TEXT,
  p_new_title TEXT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_pattern TEXT;
  v_updated INTEGER;
BEGIN
  -- SECURITY INVOKER (défaut) : l'UPDATE ci-dessous reste soumis à la RLS
  -- de l'appelant — wwp_update exige déjà is_world_editor(world_id, uid),
  -- donc un appelant non-éditeur ne modifie simplement aucune ligne.

  -- Échappe les métacaractères regex du titre pour un remplacement
  -- littéral insensible à la casse de `[[Ancien titre]]` (les espaces
  -- internes ne sont pas tolérés ici, contrairement à resolveWikiLinks
  -- côté lecture — un renommage tapé normalement suffit).
  v_pattern := '\[\[' || regexp_replace(p_old_title, '([.^$|()\[\]{}*+?\\])', '\\\1', 'g') || '\]\]';

  UPDATE public.world_wiki_pages
  SET content = regexp_replace(content, v_pattern, '[[' || p_new_title || ']]', 'gi'),
      draft_content = regexp_replace(draft_content, v_pattern, '[[' || p_new_title || ']]', 'gi')
  WHERE world_id = p_world_id
    AND (content ~* v_pattern OR draft_content ~* v_pattern);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;


-- ── 2. Rétention de l'historique ─────────────────────────────

CREATE OR REPLACE FUNCTION public.wwp_log_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NEW.published_at IS NOT NULL
     AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.published_at IS DISTINCT FROM OLD.published_at)
  THEN
    INSERT INTO public.world_wiki_page_versions (page_id, title, content, author_id)
    VALUES (NEW.id, NEW.title, NEW.content, auth.uid());

    DELETE FROM public.world_wiki_page_versions
    WHERE page_id = NEW.id
      AND id NOT IN (
        SELECT id FROM public.world_wiki_page_versions
        WHERE page_id = NEW.id
        ORDER BY created_at DESC
        LIMIT 50
      );
  END IF;
  RETURN NEW;
END;
$$;
