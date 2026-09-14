-- ============================================================
-- Migration 175 — Fin de la reprise du statut marital
-- ============================================================
-- La 173 a fait des demandes de couple des relations réciproques, en gardant
-- `persona_marital_requests`, sa RPC et son déclencheur le temps que le code
-- qui y écrivait soit remplacé. La PR #69 l'a remplacé, fusionnée dans `main`
-- et déployée en production le 2026-09-14. Cette migration ferme la fenêtre,
-- comme la 172 l'a fait pour le catalogue.
--
-- État relevé avant suppression (2026-09-14) :
--   persona_marital_requests   0 ligne
--   notifications              2 de type `marital_request` (une par statut)
--   notification_preferences   0 de type `marital_request`
--   référencée par             accept_marital_request, ses deux déclencheurs ;
--                              aucune clé étrangère entrante
--
-- ── 1. Rejouer la reprise ────────────────────────────────────
-- Entre la 173 et le déploiement, l'ancien code a pu y écrire. Le même
-- INSERT que la 173, rejouable.
--
-- ── 2. Les notifications ─────────────────────────────────────
-- Les deux notifications `marital_request` deviennent des `relation_request` :
-- même phrase à l'écran (le texte du mariage vient de `marital_status`, que
-- l'on recopie de `requested_status`), et leur carte dira « plus valide » —
-- la demande qu'elles désignaient n'existe plus sous cet identifiant. Le type
-- `marital_request` sort ensuite des contraintes.
--
-- ── 3. Supprimer ─────────────────────────────────────────────
-- Après la copie, jamais avant.

-- ── 1. Reprise de ce qui aurait été écrit entre-temps ────────
INSERT INTO public.persona_relations (world_id, from_persona_id, to_persona_id, type, status, created_by)
SELECT a.world_id, r.requester_persona_id, r.target_persona_id, t.id::text, 'pending', a.user_id
  FROM public.persona_marital_requests r
  JOIN public.personas a ON a.id = r.requester_persona_id
  JOIN public.world_relation_types t ON t.world_id = a.world_id AND t.marital_status = r.requested_status
 WHERE r.status = 'pending'
ON CONFLICT (world_id, from_persona_id, to_persona_id) DO NOTHING;

-- ── 2. Les notifications ─────────────────────────────────────
UPDATE public.notifications
   SET type = 'relation_request',
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('marital_status', metadata->'requested_status')
 WHERE type = 'marital_request';

-- La clé primaire est (user_id, type) : une préférence `relation_request`
-- déjà posée l'emporte, l'ancienne s'efface.
DELETE FROM public.notification_preferences p
 WHERE p.type = 'marital_request'
   AND EXISTS (SELECT 1 FROM public.notification_preferences q WHERE q.user_id = p.user_id AND q.type = 'relation_request');
UPDATE public.notification_preferences SET type = 'relation_request' WHERE type = 'marital_request';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply', 'relation_request'
  ));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply', 'relation_request'
  ));

-- ── 3. L'ancienne mécanique ──────────────────────────────────
DROP FUNCTION IF EXISTS public.accept_marital_request(UUID);
DROP TRIGGER IF EXISTS on_marital_request_notify ON public.persona_marital_requests;
DROP FUNCTION IF EXISTS public.notify_on_marital_request();
DROP TRIGGER IF EXISTS trg_enforce_marital_request_same_world ON public.persona_marital_requests;
DROP FUNCTION IF EXISTS public.enforce_marital_request_same_world();
DROP TABLE IF EXISTS public.persona_marital_requests;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='persona_marital_requests';     -- → 0
-- SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname LIKE '%marital_request%';           -- → 0
-- SELECT count(*) FROM public.notifications WHERE type = 'marital_request';   -- → 0

-- ── ROLLBACK ─────────────────────────────────────────────────
-- La table était alimentée par du code retiré : la recréer ne restaure pas
-- son contenu (vide au moment de la suppression). Sa structure, sa RPC et ses
-- déclencheurs sont dans la migration 093 ; les contraintes de type de
-- notification avec `marital_request` dans la 173.
