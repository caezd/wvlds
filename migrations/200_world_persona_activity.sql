-- ─────────────────────────────────────────────────────────────
-- Migration 200 — L'activité récente des personas d'un monde
--
-- La liste des personas met en vedette, sur chaque étagère, le persona le
-- plus actif. `get_world_persona_activity` rend, pour chaque persona qui a
-- écrit dans le monde ces `p_days` derniers jours, son nombre de messages
-- et la date du dernier.
--
-- Seuls les messages publics comptent (`visible_to` vide), comme pour
-- `chatroom_persona_authors` (migration 199) : un aparté ne doit rien dire
-- de l'activité d'un persona à ceux qui ne le lisent pas.
--
-- SECURITY INVOKER : les messages passent par leur politique de lecture
-- (membres du monde). Aucun texte n'est lu, seulement des métadonnées. La
-- fenêtre de temps se lit de l'index (world_id, created_at).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_world_persona_activity(p_world_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (persona_id uuid, message_count integer, last_message_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT m.persona_id, count(*)::integer, max(m.created_at)
    FROM public.chat_messages m
   WHERE m.world_id = p_world_id
     AND m.created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
     AND m.persona_id IS NOT NULL
     AND m.visible_to IS NULL
   GROUP BY m.persona_id;
$$;

REVOKE ALL ON FUNCTION public.get_world_persona_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_persona_activity(uuid, integer) TO authenticated;
