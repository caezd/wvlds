-- ============================================================
-- Migration 120 — Clés de chiffrement lisibles par tout compte
-- ============================================================
-- `chatroom_keys` porte la clé AES de chaque salon (`key_b64`), celle qui
-- déchiffre `chat_messages`. Ses deux policies étaient ouvertes en grand :
--
--   chatroom_keys_select : USING (true)
--   chatroom_keys_insert : WITH CHECK (true)
--
-- Autrement dit, **n'importe quel compte connecté** — y compris un compte neuf,
-- membre d'aucun monde — pouvait lire les 33 clés de tous les salons, et écrire
-- une clé pour n'importe quel salon.
--
-- Portée réelle, mesurée avant correction : le texte chiffré, lui, reste
-- protégé par la RLS de `chat_messages` (un inconnu y lit 0 ligne). Personne ne
-- pouvait donc déchiffrer quoi que ce soit par l'API seule. Mais c'est
-- précisément ce que le chiffrement au repos est censé garantir en second
-- rideau : qu'une fuite des messages — sauvegarde, export, policy relâchée un
-- jour, nouveau chemin de lecture — ne livre pas le contenu. Avec les clés
-- lisibles par tout compte, cette garantie ne valait rien.
--
-- Le `WITH CHECK (true)` en écriture ouvrait en plus une course : le client
-- génère la clé au premier accès à un salon qui n'en a pas (cf. le bootstrap
-- dans app/(protected)/c/[id]/view.tsx). Un tiers pouvait insérer la sienne
-- avant lui et connaître d'avance la clé du salon.
--
-- Le périmètre retenu est celui, déjà en place, de la table `chatrooms` :
-- « chatrooms select if world member » = `is_world_member(world_id, …)`. On
-- peut lire ou créer la clé d'un salon exactement quand on peut voir ce salon —
-- ce dont les deux usages légitimes ont besoin : la vue d'un salon (une clé) et
-- le centre de recherche (plusieurs clés d'un même monde, cf. lib/chatroomKeys.ts).
--
-- `chatrooms.world_id` est NOT NULL et aucun salon n'est orphelin : la
-- condition couvre bien 100 % des lignes.

DROP POLICY IF EXISTS "chatroom_keys_select" ON public.chatroom_keys;
CREATE POLICY "chatroom_keys_select" ON public.chatroom_keys
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = chatroom_keys.chatroom_id
        AND is_world_member(c.world_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "chatroom_keys_insert" ON public.chatroom_keys;
CREATE POLICY "chatroom_keys_insert" ON public.chatroom_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = chatroom_keys.chatroom_id
        AND is_world_member(c.world_id, (select auth.uid()))
    )
  );

-- Aucune policy UPDATE ni DELETE n'existe, et on n'en ajoute pas : une clé de
-- salon ne doit jamais changer, sous peine de rendre illisibles tous les
-- messages déjà chiffrés avec l'ancienne.

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Sous l'identité d'un compte membre d'aucun monde, doit renvoyer 0 :
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-0000-0000-0000000009f9","role":"authenticated"}', true);
--   SELECT count(*) FROM chatroom_keys;
-- Sous l'identité d'un membre, doit renvoyer les clés de SES salons uniquement.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ⚠️ Rétablit l'accès universel décrit ci-dessus — dépannage seulement.
-- DROP POLICY IF EXISTS "chatroom_keys_select" ON public.chatroom_keys;
-- CREATE POLICY "chatroom_keys_select" ON public.chatroom_keys
--   FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS "chatroom_keys_insert" ON public.chatroom_keys;
-- CREATE POLICY "chatroom_keys_insert" ON public.chatroom_keys
--   FOR INSERT TO authenticated WITH CHECK (true);
