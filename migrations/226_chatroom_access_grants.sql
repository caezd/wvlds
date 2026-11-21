-- ─────────────────────────────────────────────────────────────
-- Migration 226 — Droits d'exécution des règles d'accès aux salons
--
-- La migration 225 a laissé `anon` appeler trois de ses règles. Elles
-- prennent un compte quelconque en paramètre : un visiteur non connecté
-- pouvait demander si tel compte est invité dans tel salon privé, ou peut y
-- écrire. Comme `has_world_permission` et `owns_persona`, elles ne servent
-- qu'à des policies réservées à `authenticated` et à des fonctions SECURITY
-- DEFINER (exécutées par leur propriétaire).
--
-- `can_read_chatroom` reste exécutable par `anon`, comme `is_world_member`
-- qu'elle remplace : des policies sans rôle (`chat_messages`, `chat_pins`,
-- réactions…) l'appellent aussi pour `anon`, qui doit y lire zéro ligne et
-- non une erreur de droits.
-- ─────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.can_read_private_chatroom(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_post_in_chatroom(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_chatroom_access(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_read_private_chatroom(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_post_in_chatroom(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_chatroom_access(uuid, uuid) TO authenticated;
