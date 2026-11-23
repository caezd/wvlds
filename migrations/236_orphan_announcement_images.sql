-- 236 — Images d'annonces abandonnées : qui les retrouve.
--
-- L'image d'en-tête d'une annonce (migration 235) part dans le stockage dès
-- qu'on la choisit, sous `user-<auteur>/announcements/` du bucket `worlds`.
-- L'application efface aussitôt celle qu'on remplace, retire ou abandonne ;
-- reste ce qu'elle ne peut pas voir : un onglet fermé avant l'envoi, l'image
-- remplacée d'une annonce écrite par un autre membre de l'équipe (la policy du
-- bucket ne laisse effacer que son propre préfixe).
--
-- `orphan_announcement_images` liste ces fichiers : plus vieux que
-- `p_min_age` (un brouillon ouvert garde le sien), et désignés par aucune
-- annonce (envoyée, retirée comprise) ni par aucun envoi programmé en attente.
-- La tâche quotidienne `/api/cron/announcement-images` les efface par l'API
-- du stockage — jamais par un DELETE SQL, qui laisserait le fichier en place.
-- Réservée au `service_role`.

CREATE OR REPLACE FUNCTION public.orphan_announcement_images(
  p_min_age interval DEFAULT interval '1 day',
  p_limit   integer  DEFAULT 500
)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH refs AS (
    SELECT substring(a.image_url FROM '/object/public/worlds/([^?#]+)') AS name
      FROM public.world_announcements a
     WHERE a.image_url IS NOT NULL
    UNION
    SELECT substring(s.extras ->> 'image_url' FROM '/object/public/worlds/([^?#]+)')
      FROM public.world_scheduled_announcements s
     WHERE s.status = 'pending' AND s.extras ? 'image_url'
  )
  SELECT o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'worlds'
     AND o.name ~ '^user-[0-9a-fA-F-]{36}/announcements/'
     AND o.created_at < now() - p_min_age
     AND NOT EXISTS (SELECT 1 FROM refs r WHERE r.name = o.name)
   ORDER BY o.created_at
   LIMIT least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;
REVOKE ALL ON FUNCTION public.orphan_announcement_images(interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_announcement_images(interval, integer) TO service_role;
