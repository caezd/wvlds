-- 224 — Réordonner en une requête, partout (modèle : migration 162).
--
-- Réordonner une liste réécrivait le rang de chaque élément par un `update`
-- distinct — en série pour les cartes, en parallèle ailleurs : autant
-- d'allers-retours que d'éléments, un ordre à moitié écrit si l'un échouait,
-- et surtout un refus de la RLS invisible (elle ne lève pas d'erreur, elle ne
-- touche aucune ligne) : l'ordre affiché revenait en arrière au rechargement.
--
-- Chaque fonction applique toute la liste en un `UPDATE … FROM
-- jsonb_to_recordset`, donc en une transaction, et RENVOIE LE NOMBRE DE LIGNES
-- touchées : l'appelant le compare à ce qu'il a envoyé et annule l'affichage
-- si le compte n'y est pas. SECURITY INVOKER : la RLS et les triggers de
-- chaque table s'appliquent tels quels, rien n'est ré-implémenté ici.

-- Onglets de cartes du monde (app/actions/worldMap.reorderWorldMaps).
CREATE OR REPLACE FUNCTION public.reorder_world_maps(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.world_maps t
     SET sort_index = e.sort_index, updated_at = now()
    FROM jsonb_to_recordset(p_items) AS e(id uuid, sort_index integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_world_maps(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_world_maps(jsonb) TO authenticated;

-- Arbre du wiki : rang et dossier parent (WorldWiki, lib/wikiTreeMove.planMove).
CREATE OR REPLACE FUNCTION public.reorder_world_wiki_pages(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.world_wiki_pages t
     SET parent_id = e.parent_id, sort_index = e.sort_index
    FROM jsonb_to_recordset(p_items) AS e(id uuid, parent_id uuid, sort_index integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_world_wiki_pages(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_world_wiki_pages(jsonb) TO authenticated;

-- Catégories de salons (app/actions/chatroomCategories.reorderChatroomCategories).
CREATE OR REPLACE FUNCTION public.reorder_chatroom_categories(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.chatroom_categories t
     SET position = e.position
    FROM jsonb_to_recordset(p_items) AS e(id uuid, position integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_chatroom_categories(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_chatroom_categories(jsonb) TO authenticated;

-- Onglets d'une fiche hors brouillon : fiche par défaut du monde (PersonaSectionsTabs).
CREATE OR REPLACE FUNCTION public.reorder_persona_sections(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.persona_sections t
     SET position = e.position
    FROM jsonb_to_recordset(p_items) AS e(id uuid, position integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_persona_sections(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_persona_sections(jsonb) TO authenticated;

-- Catégories de notes d'une page du wiki (hooks/useWikiPageNotes).
CREATE OR REPLACE FUNCTION public.reorder_wiki_note_categories(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.world_wiki_page_note_categories t
     SET sort_index = e.sort_index
    FROM jsonb_to_recordset(p_items) AS e(id uuid, sort_index integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_wiki_note_categories(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_wiki_note_categories(jsonb) TO authenticated;

-- Notes d'une page du wiki : rang et catégorie (hooks/useWikiPageNotes).
CREATE OR REPLACE FUNCTION public.reorder_wiki_notes(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.world_wiki_page_notes t
     SET category_id = e.category_id, sort_index = e.sort_index
    FROM jsonb_to_recordset(p_items) AS e(id uuid, category_id uuid, sort_index integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_wiki_notes(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_wiki_notes(jsonb) TO authenticated;
