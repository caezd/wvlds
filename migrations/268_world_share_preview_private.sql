-- ════════════════════════════════════════════════════════════════════════
-- 268 — Aperçu d'un lien partagé : le nom d'un monde privé
--
-- Reprend get_world_share_preview (267). Un monde privé non supprimé donne
-- désormais son nom, et seulement son nom (`private: true`) : l'image
-- d'aperçu et la page de connexion montrent un cadenas et ce nom, « sur
-- invitation ». Ni description, ni image, ni membres, ni nom de salon.
--
-- Il faut avoir le lien (un uuid) pour l'obtenir ; un monde supprimé ou
-- un id inconnu donne toujours NULL, l'aperçu générique.
--
-- Monde public : inchangé, plus `private: false`.
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
  SELECT CASE
           WHEN w.visibility = 'public' THEN jsonb_build_object(
             'id', w.id,
             'name', w.name,
             'private', false,
             'age_restricted', w.is_age_restricted,
             'description', CASE WHEN w.is_age_restricted THEN NULL ELSE NULLIF(btrim(w.description), '') END,
             'icon_url', CASE WHEN w.is_age_restricted THEN NULL ELSE w.icon_url END,
             'banner_url', CASE WHEN w.is_age_restricted THEN NULL ELSE w.banner_url END,
             'color', w.color,
             'member_count', (SELECT count(*) FROM public.world_members wm WHERE wm.world_id = w.id),
             'chatroom_name', (SELECT nom FROM salon)
           )
           ELSE jsonb_build_object('id', w.id, 'name', w.name, 'private', true)
         END
    FROM public.worlds w
    JOIN cible ON cible.world_id = w.id
   WHERE w.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_world_share_preview(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_world_share_preview(uuid, uuid) TO anon, authenticated;

-- Retour : réappliquer migrations/267_world_share_preview.sql.
