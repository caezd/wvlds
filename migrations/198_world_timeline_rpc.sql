-- ─────────────────────────────────────────────────────────────
-- Migration 198 — La chronologie d'un monde en une requête
--
-- La frise lançait neuf requêtes au chargement (événements, arcs, salons
-- datés avec arc / catégorie / statut / activité, catégories, auteurs,
-- personas, suites, salons où l'on joue, journaux), qui arrivaient chacune
-- à leur tour : les couleurs, les « par … » et les barres paraissaient par
-- à-coups. `get_world_timeline` rend tout en un seul JSON, que la frise
-- affiche d'un bloc.
--
-- SECURITY INVOKER : chaque partie passe par les politiques de ses tables
-- (salons et événements du monde pour ses membres, pages du wiki
-- restreintes masquées, journaux…), exactement comme les requêtes qu'elle
-- remplace. Elle réutilise `get_chatroom_openers` et `get_chatroom_personas`
-- (migrations 192, 196), invoker elles aussi.
--
-- Index : les personas de chaque salon se lisent d'un index (monde, salon,
-- persona) plutôt qu'en parcourant les messages du monde ; les journaux
-- datés d'un monde, d'un index sur le monde.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS chat_messages_world_chat_persona_idx
  ON public.chat_messages (world_id, chat_id, persona_id)
  WHERE persona_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS persona_journal_entries_world_dated_idx
  ON public.persona_journal_entries (world_id)
  WHERE timeline_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_world_timeline(p_world_id uuid, p_with_journals boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH rooms AS (
    SELECT c.id, c.title, c.name, c.icon_url, c.timeline_date, c.arc_id, c.category_id,
           c.status, c.created_at, c.created_by
      FROM public.chatrooms c
     WHERE c.world_id = p_world_id
       AND c.timeline_date IS NOT NULL
  ),
  openers AS (
    SELECT * FROM public.get_chatroom_openers(p_world_id)
  ),
  room_personas AS (
    SELECT * FROM public.get_chatroom_personas(p_world_id)
  ),
  personas_by_room AS (
    SELECT rp.chat_id, jsonb_agg(rp.persona_id) AS ids
      FROM room_personas rp
     GROUP BY rp.chat_id
  ),
  -- Les salons où l'on joue : qu'on a créés, ou où l'on a écrit (même règle
  -- que `is_chatroom_participant`) — pour savoir quelles suites proposées
  -- on peut accepter.
  mine AS (
    SELECT r.id FROM rooms r WHERE r.created_by = (SELECT auth.uid())
    UNION
    SELECT m.chat_id
      FROM public.chat_messages m
      JOIN rooms r ON r.id = m.chat_id
     WHERE m.world_id = p_world_id
       AND m.author_id = (SELECT auth.uid())
  )
  SELECT jsonb_build_object(
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'name', r.name,
        'icon_url', r.icon_url,
        'timeline_date', r.timeline_date,
        'arc_id', r.arc_id,
        'category_id', r.category_id,
        'status', r.status,
        'last_activity', COALESCE(s.last_message_at, r.created_at),
        'opener_name', o.author_name,
        'opener_persona', o.persona_name,
        'opener_color', o.group_color,
        'persona_ids', COALESCE(pb.ids, '[]'::jsonb)
      ))
        FROM rooms r
        LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
        LEFT JOIN openers o ON o.chat_id = r.id
        LEFT JOIN personas_by_room pb ON pb.chat_id = r.id
    ), '[]'::jsonb),
    'personas', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', rp.persona_id, 'name', rp.persona_name, 'color', rp.group_color))
        FROM room_personas rp
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'timeline_date', e.timeline_date,
        'end_date', e.end_date,
        'wiki_page_id', e.wiki_page_id,
        'wiki_page', CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('slug', w.slug, 'title', w.title) END
      ))
        FROM public.world_timeline_events e
        LEFT JOIN public.world_wiki_pages w ON w.id = e.wiki_page_id
       WHERE e.world_id = p_world_id
    ), '[]'::jsonb),
    'arcs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color, 'position', a.position)
                       ORDER BY a.position, a.name)
        FROM public.world_timeline_arcs a
       WHERE a.world_id = p_world_id
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title) ORDER BY k.position)
        FROM public.chatroom_categories k
       WHERE k.world_id = p_world_id
    ), '[]'::jsonb),
    'sequels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'chatroom_id', q.chatroom_id,
        'previous_id', q.previous_id,
        'status', q.status,
        'created_by_name', p.username
      ))
        FROM public.chatroom_sequels q
        LEFT JOIN public.profiles p ON p.id = q.created_by
       WHERE q.world_id = p_world_id
    ), '[]'::jsonb),
    'mine', COALESCE((SELECT jsonb_agg(m.id) FROM mine m), '[]'::jsonb),
    'journals', CASE WHEN p_with_journals THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', j.id,
        'persona_id', j.persona_id,
        'persona_name', pe.name,
        'body', j.body,
        'timeline_date', j.timeline_date
      ))
        FROM public.persona_journal_entries j
        LEFT JOIN public.personas pe ON pe.id = j.persona_id
       WHERE j.world_id = p_world_id
         AND j.timeline_date IS NOT NULL
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
$$;

REVOKE ALL ON FUNCTION public.get_world_timeline(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_timeline(uuid, boolean) TO authenticated;
