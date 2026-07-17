-- ============================================================
-- Migration 092 — mark_chatroom_read() : horloge serveur + pas de retour arrière
-- ============================================================
-- Deux défauts corrigés, tous deux dans le marquage « lu ».
--
-- 1. HORLOGE CLIENT — le marquage passait par un upsert direct :
--        last_read_at: lastReadAt ?? new Date().toISOString()
--    Sur le chemin Realtime, aucun horodatage n'était transmis : la valeur
--    venait donc de l'horloge du NAVIGATEUR, comparée ensuite à des
--    `chat_messages.created_at` posés par l'horloge du SERVEUR. Un client en
--    retard de quelques secondes laissait `m.created_at > cr.last_read_at`
--    vrai : le message restait non lu, et le badge revenait au rechargement.
--    Un client en avance produisait l'inverse, plus grave — des messages
--    marqués lus avant même d'exister.
--    `COALESCE(p_last_read_at, now())` résout l'absence d'horodatage avec
--    l'horloge du serveur, la seule qui fasse autorité ici.
--
-- 2. RETOUR ARRIÈRE — l'upsert écrasait `last_read_at` sans condition. Deux
--    écritures qui se croisent (deux onglets, ou la queue du throttle client
--    qui arrive après une écriture plus récente) pouvaient donc REMONTER le
--    temps et ressusciter des non-lus déjà effacés. `GREATEST` rend l'écriture
--    monotone : la position de lecture ne recule jamais.
--
-- SECURITY INVOKER (défaut) volontairement : les RLS de chatroom_reads
-- (`user_id = auth.uid()`, toutes commandes) continuent de s'appliquer telles
-- quelles. Le gating est donc identique à celui de l'upsert direct qu'elle
-- remplace — rien à répliquer, rien à contourner.

CREATE OR REPLACE FUNCTION public.mark_chatroom_read(
  p_chat_id      uuid,
  p_last_read_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SET search_path TO 'public'
AS $$
  INSERT INTO public.chatroom_reads (chat_id, user_id, last_read_at)
  VALUES (p_chat_id, auth.uid(), COALESCE(p_last_read_at, now()))
  ON CONFLICT (chat_id, user_id) DO UPDATE
    SET last_read_at = GREATEST(chatroom_reads.last_read_at, EXCLUDED.last_read_at);
$$;

GRANT EXECUTE ON FUNCTION public.mark_chatroom_read(uuid, timestamptz) TO authenticated;
