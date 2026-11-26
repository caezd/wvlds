-- ════════════════════════════════════════════════════════════════════════
-- 267 — Aperçu public d'un monde partagé par lien
--
-- Un lien /w/<id> ou /c/<id> ouvert sans session mène à la connexion
-- (?next=…). La page montre le monde visé, et les robots d'aperçu (Discord,
-- iMessage, Facebook…) en tirent titre, description et image. Ni l'un ni
-- l'autre n'est connecté : aucune politique RLS ne leur ouvre `worlds`.
--
-- Cette fonction leur rend le strict nécessaire, et seulement pour un monde
-- PUBLIC (visibility = 'public', celui que join_public_world accepte) et non
-- supprimé ; sinon NULL — le nom d'un monde privé ne sort jamais.
--
--   • Monde 18+ : nom et mention seulement ; ni description ni image.
--   • Salon : son nom seulement s'il est ouvert ou public ; un salon privé
--     donne l'aperçu de son monde, sans son nom. Aucun contenu de salon.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_world_share_preview(
  p_world_id uuid DEFAULT NULL,
  p_chatroom_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH salon AS (
    SELECT c.world_id,
           CASE WHEN c.visibility IN ('open', 'public')
                THEN NULLIF(btrim(COALESCE(NULLIF(btrim(c.title), ''), c.name)), '')
           END AS nom
      FROM public.chatrooms c
     WHERE p_chatroom_id IS NOT NULL
       AND c.id = p_chatroom_id
  ),
  cible AS (
    SELECT CASE WHEN p_chatroom_id IS NOT NULL THEN (SELECT world_id FROM salon) ELSE p_world_id END AS world_id
  )
  SELECT jsonb_build_object(
           'id', w.id,
           'name', w.name,
           'age_restricted', w.is_age_restricted,
           'description', CASE WHEN w.is_age_restricted THEN NULL ELSE NULLIF(btrim(w.description), '') END,
           'icon_url', CASE WHEN w.is_age_restricted THEN NULL ELSE w.icon_url END,
           'banner_url', CASE WHEN w.is_age_restricted THEN NULL ELSE w.banner_url END,
           'color', w.color,
           'member_count', (SELECT count(*) FROM public.world_members wm WHERE wm.world_id = w.id),
           'chatroom_name', (SELECT nom FROM salon)
         )
    FROM public.worlds w
    JOIN cible ON cible.world_id = w.id
   WHERE w.visibility = 'public'
     AND w.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_world_share_preview(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_world_share_preview(uuid, uuid) TO anon, authenticated;

-- Retour :
-- DROP FUNCTION IF EXISTS public.get_world_share_preview(uuid, uuid);
