-- 204 — `list_chatrooms_nav` rend la date de chronologie de chaque salon.
--
-- La page d'un monde dont la chronologie est activée relisait `chatrooms`
-- (`id, timeline_date`) APRÈS le retour de cette fonction, pour attacher les
-- dates aux salons : un aller-retour réseau de plus, en série, à chaque rendu
-- de `/w/[id]`. La colonne vient désormais avec le reste.
--
-- Ajouter une colonne au `RETURNS TABLE` change le type de retour : `CREATE OR
-- REPLACE` le refuse, d'où le DROP + CREATE dans une transaction. Le corps est
-- celui de la migration 130 (identique à la production), plus `timeline_date`
-- en dernière colonne ; le `search_path` est celui posé par la migration 131.
--
-- Déploiement : le code accepte les deux formes. Tant que la migration n'est
-- pas passée, il relit les dates comme avant (cf. WorldHomeContent.tsx).

BEGIN;

DROP FUNCTION IF EXISTS public.list_chatrooms_nav(uuid);

CREATE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
 RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text, last_poster_id uuid, participant_count integer, second_poster_avatar_url text, timeline_date jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT
    r.id,
    r.title,
    r.name,
    r.icon_url,
    s.last_message_at,
    s.last_message_excerpt,
    COALESCE((
      SELECT COUNT(*)::int
      FROM public.chat_messages m
      WHERE m.chat_id = r.id
        AND m.author_id <> auth.uid()
        AND m.created_at > COALESCE(
          (SELECT cr.last_read_at FROM public.chatroom_reads cr
           WHERE cr.chat_id = r.id AND cr.user_id = auth.uid()),
          '-infinity'::timestamptz
        )
    ), 0) AS unread_count,
    r.category_id,
    COALESCE(s.last_message_persona_avatar_url, p.avatar_url) AS last_poster_avatar_url,
    s.last_message_author_id                                   AS last_poster_id,
    (SELECT COUNT(DISTINCT cm.author_id)::int
     FROM public.chat_messages cm
     WHERE cm.chat_id = r.id
       AND (auth.uid() IS NULL OR cm.author_id <> auth.uid())
    ) AS participant_count,
    (SELECT COALESCE(pn.avatar_url, p2.avatar_url)
     FROM public.chat_messages cm2
     LEFT JOIN public.profiles p2 ON p2.id = cm2.author_id
     LEFT JOIN public.personas pn ON pn.id = cm2.persona_id
     WHERE cm2.chat_id = r.id
       AND (auth.uid() IS NULL OR cm2.author_id <> auth.uid())
       AND (s.last_message_author_id IS NULL OR cm2.author_id <> s.last_message_author_id)
     ORDER BY cm2.created_at DESC
     LIMIT 1
    ) AS second_poster_avatar_url,
    r.timeline_date
  FROM public.chatrooms r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  WHERE r.world_id = p_world_id
    AND (
      EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = auth.uid())
    )
  ORDER BY COALESCE(s.last_message_at, r.updated_at) DESC;
$function$;

-- Le DROP a emporté les droits d'exécution : on rend ceux qu'une fonction
-- neuve reçoit par défaut sur Supabase, comme avant.
GRANT EXECUTE ON FUNCTION public.list_chatrooms_nav(uuid) TO anon, authenticated, service_role;

COMMIT;

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- Rejouer la définition de la migration 130 après un
-- DROP FUNCTION public.list_chatrooms_nav(uuid);
-- puis : ALTER FUNCTION public.list_chatrooms_nav(uuid) SET search_path = public, pg_temp;
-- et le GRANT ci-dessus. Le code retombe alors sur la relecture des dates.
