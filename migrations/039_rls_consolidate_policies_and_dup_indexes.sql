-- 039_rls_consolidate_policies_and_dup_indexes.sql
--
-- Deux nettoyages de performance, sans aucun changement de comportement :
--
-- A) Suppression de 3 index *strictement redondants* (advisor `duplicate_index`)
--    - chatroom_persona_prefs_chat_user_idx : couvert par la PK (chat_id,user_id)
--    - idx_profiles_username_lower_unique    : doublon de profiles_username_unique_idx
--      (deux index UNIQUE identiques ; l'unicité reste garantie par le survivant)
--    - idx_world_content_tabs_world          : doublon de idx_world_content_tabs_world_id
--
-- B) Consolidation des policies PERMISSIVE qui se chevauchent SUR LE MÊME rôle et
--    la même commande (advisor `multiple_permissive_policies`). Les policies
--    permissives se combinent en OR : remplacer N policies d'un même groupe
--    (table, commande, rôle) par UNE policy dont la condition est le OR des
--    conditions est *prouvablement équivalent* — mêmes lignes visibles, mêmes
--    écritures autorisées. Seuls les groupes même-rôle sont fusionnés ; les
--    chevauchements INTER-rôles ({public} + {authenticated}) sont laissés intacts
--    pour ne pas risquer d'élargir l'accès aux utilisateurs anonymes.
--
-- Sûreté : migration atomique (tout ou rien). Rollback complet en fin de fichier.

-- ── A) Index dupliqués ─────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.chatroom_persona_prefs_chat_user_idx;
DROP INDEX IF EXISTS public.idx_profiles_username_lower_unique;
DROP INDEX IF EXISTS public.idx_world_content_tabs_world;

-- ── B) Fusion des policies permissives même-rôle ───────────────────────────

-- chatrooms · UPDATE · authenticated
DROP POLICY "chatrooms update title by creator or editor" ON public.chatrooms;
DROP POLICY "chatrooms: update by owner or world admin" ON public.chatrooms;
CREATE POLICY chatrooms_update_authenticated_merged ON public.chatrooms AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM world_members wm
  WHERE ((wm.world_id = chatrooms.world_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role]))))))) OR (((created_by = ( SELECT auth.uid() AS uid)) OR is_world_editor(world_id, ( SELECT auth.uid() AS uid)))))
  WITH CHECK ((((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM world_members wm
  WHERE ((wm.world_id = chatrooms.world_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role]))))))) OR (((created_by = ( SELECT auth.uid() AS uid)) OR is_world_editor(world_id, ( SELECT auth.uid() AS uid)))));

-- notifications · INSERT · public
DROP POLICY "notifications: insert mention" ON public.notifications;
DROP POLICY "notifications: insert world_invite" ON public.notifications;
CREATE POLICY notifications_insert_public_merged ON public.notifications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((type = 'mention'::text) AND (actor_id = ( SELECT auth.uid() AS uid)) AND (recipient_id <> ( SELECT auth.uid() AS uid)))) OR (((type = 'world_invite'::text) AND (actor_id = ( SELECT auth.uid() AS uid)) AND (recipient_id <> ( SELECT auth.uid() AS uid)))));

-- personas · SELECT · authenticated  (absorbe aussi le doublon exact personas_select_own)
DROP POLICY "personas: owner select" ON public.personas;
DROP POLICY "personas: readable if referenced in accessible chat" ON public.personas;
DROP POLICY personas_select_own ON public.personas;
CREATE POLICY personas_select_authenticated_merged ON public.personas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (chat_messages m
     JOIN chatrooms c ON ((c.id = m.chat_id)))
  WHERE ((m.persona_id = personas.id) AND is_world_member(c.world_id, ( SELECT auth.uid() AS uid))))))) OR ((user_id = ( SELECT auth.uid() AS uid))));

-- user_owned_cosmetics · SELECT · public
DROP POLICY "user_owned_cosmetics: admin read" ON public.user_owned_cosmetics;
DROP POLICY "user_owned_cosmetics: owner read" ON public.user_owned_cosmetics;
CREATE POLICY user_owned_cosmetics_select_public_merged ON public.user_owned_cosmetics AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR ((user_id = ( SELECT auth.uid() AS uid))));

-- world_content_tabs · ALL · public
DROP POLICY "tabs: manage if world editor (non-system)" ON public.world_content_tabs;
DROP POLICY "world_content_tabs: owner write" ON public.world_content_tabs;
CREATE POLICY world_content_tabs_all_public_merged ON public.world_content_tabs AS PERMISSIVE FOR ALL TO public
  USING (((EXISTS ( SELECT 1
   FROM worlds
  WHERE ((worlds.id = world_content_tabs.world_id) AND (worlds.owner_id = ( SELECT auth.uid() AS uid)))))) OR ((is_world_editor(world_id, ( SELECT auth.uid() AS uid)) AND (is_system = false))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM worlds
  WHERE ((worlds.id = world_content_tabs.world_id) AND (worlds.owner_id = ( SELECT auth.uid() AS uid)))))) OR ((is_world_editor(world_id, ( SELECT auth.uid() AS uid)) AND (is_system = false))));

-- world_invitations · DELETE · public
DROP POLICY "world_invitations: delete as invitee" ON public.world_invitations;
DROP POLICY "world_invitations: delete as manager" ON public.world_invitations;
CREATE POLICY world_invitations_delete_public_merged ON public.world_invitations AS PERMISSIVE FOR DELETE TO public
  USING ((((inviter_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM world_members
  WHERE ((world_members.world_id = world_invitations.world_id) AND (world_members.user_id = ( SELECT auth.uid() AS uid)) AND (world_members.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role]))))))) OR ((invitee_id = ( SELECT auth.uid() AS uid))));

-- world_invitations · SELECT · public
DROP POLICY "world_invitations: read as manager" ON public.world_invitations;
DROP POLICY "world_invitations: read own" ON public.world_invitations;
CREATE POLICY world_invitations_select_public_merged ON public.world_invitations AS PERMISSIVE FOR SELECT TO public
  USING ((((invitee_id = ( SELECT auth.uid() AS uid)) OR (inviter_id = ( SELECT auth.uid() AS uid)))) OR ((EXISTS ( SELECT 1
   FROM world_members
  WHERE ((world_members.world_id = world_invitations.world_id) AND (world_members.user_id = ( SELECT auth.uid() AS uid)) AND (world_members.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role])))))));

-- world_members · SELECT · authenticated
DROP POLICY "members: read by world owner" ON public.world_members;
DROP POLICY "members: read roster of own worlds" ON public.world_members;
CREATE POLICY world_members_select_authenticated_merged ON public.world_members AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_world_member(world_id, ( SELECT auth.uid() AS uid))) OR (is_world_owner_direct(world_id, ( SELECT auth.uid() AS uid))));

-- worlds · SELECT · public
DROP POLICY "worlds: read by invitee" ON public.worlds;
DROP POLICY "worlds: read by persona owner" ON public.worlds;
CREATE POLICY worlds_select_public_merged ON public.worlds AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM personas
  WHERE ((personas.world_id = worlds.id) AND (personas.user_id = ( SELECT auth.uid() AS uid)))))) OR ((EXISTS ( SELECT 1
   FROM world_invitations
  WHERE ((world_invitations.world_id = worlds.id) AND (world_invitations.invitee_id = ( SELECT auth.uid() AS uid)))))));

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) — restaure l'état d'avant 039
-- ════════════════════════════════════════════════════════════════════════════
--
-- -- A) index
-- CREATE INDEX chatroom_persona_prefs_chat_user_idx ON public.chatroom_persona_prefs USING btree (chat_id, user_id);
-- CREATE UNIQUE INDEX idx_profiles_username_lower_unique ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
-- CREATE INDEX idx_world_content_tabs_world ON public.world_content_tabs USING btree (world_id, sort_index);
--
-- -- B) policies (drop des fusionnées puis recréation des originales)
-- DROP POLICY chatrooms_update_authenticated_merged ON public.chatrooms;
-- DROP POLICY notifications_insert_public_merged ON public.notifications;
-- DROP POLICY personas_select_authenticated_merged ON public.personas;
-- DROP POLICY user_owned_cosmetics_select_public_merged ON public.user_owned_cosmetics;
-- DROP POLICY world_content_tabs_all_public_merged ON public.world_content_tabs;
-- DROP POLICY world_invitations_delete_public_merged ON public.world_invitations;
-- DROP POLICY world_invitations_select_public_merged ON public.world_invitations;
-- DROP POLICY world_members_select_authenticated_merged ON public.world_members;
-- DROP POLICY worlds_select_public_merged ON public.worlds;
--
-- CREATE POLICY "chatrooms update title by creator or editor" ON public.chatrooms AS PERMISSIVE FOR UPDATE TO authenticated
--   USING (((created_by = ( SELECT auth.uid() AS uid)) OR is_world_editor(world_id, ( SELECT auth.uid() AS uid))))
--   WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR is_world_editor(world_id, ( SELECT auth.uid() AS uid))));
-- CREATE POLICY "chatrooms: update by owner or world admin" ON public.chatrooms AS PERMISSIVE FOR UPDATE TO authenticated
--   USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM world_members wm
--     WHERE ((wm.world_id = chatrooms.world_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role])))))))
--   WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM world_members wm
--     WHERE ((wm.world_id = chatrooms.world_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role])))))));
-- CREATE POLICY "notifications: insert mention" ON public.notifications AS PERMISSIVE FOR INSERT TO public
--   WITH CHECK (((type = 'mention'::text) AND (actor_id = ( SELECT auth.uid() AS uid)) AND (recipient_id <> ( SELECT auth.uid() AS uid))));
-- CREATE POLICY "notifications: insert world_invite" ON public.notifications AS PERMISSIVE FOR INSERT TO public
--   WITH CHECK (((type = 'world_invite'::text) AND (actor_id = ( SELECT auth.uid() AS uid)) AND (recipient_id <> ( SELECT auth.uid() AS uid))));
-- CREATE POLICY "personas: owner select" ON public.personas AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((user_id = ( SELECT auth.uid() AS uid)));
-- CREATE POLICY "personas: readable if referenced in accessible chat" ON public.personas AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM (chat_messages m JOIN chatrooms c ON ((c.id = m.chat_id)))
--     WHERE ((m.persona_id = personas.id) AND is_world_member(c.world_id, ( SELECT auth.uid() AS uid)))))));
-- CREATE POLICY personas_select_own ON public.personas AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((user_id = ( SELECT auth.uid() AS uid)));
-- CREATE POLICY "user_owned_cosmetics: admin read" ON public.user_owned_cosmetics AS PERMISSIVE FOR SELECT TO public
--   USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));
-- CREATE POLICY "user_owned_cosmetics: owner read" ON public.user_owned_cosmetics AS PERMISSIVE FOR SELECT TO public
--   USING ((user_id = ( SELECT auth.uid() AS uid)));
-- CREATE POLICY "tabs: manage if world editor (non-system)" ON public.world_content_tabs AS PERMISSIVE FOR ALL TO public
--   USING ((is_world_editor(world_id, ( SELECT auth.uid() AS uid)) AND (is_system = false)))
--   WITH CHECK ((is_world_editor(world_id, ( SELECT auth.uid() AS uid)) AND (is_system = false)));
-- CREATE POLICY "world_content_tabs: owner write" ON public.world_content_tabs AS PERMISSIVE FOR ALL TO public
--   USING ((EXISTS ( SELECT 1 FROM worlds WHERE ((worlds.id = world_content_tabs.world_id) AND (worlds.owner_id = ( SELECT auth.uid() AS uid))))))
--   WITH CHECK ((EXISTS ( SELECT 1 FROM worlds WHERE ((worlds.id = world_content_tabs.world_id) AND (worlds.owner_id = ( SELECT auth.uid() AS uid))))));
-- CREATE POLICY "world_invitations: delete as invitee" ON public.world_invitations AS PERMISSIVE FOR DELETE TO public
--   USING ((invitee_id = ( SELECT auth.uid() AS uid)));
-- CREATE POLICY "world_invitations: delete as manager" ON public.world_invitations AS PERMISSIVE FOR DELETE TO public
--   USING (((inviter_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM world_members
--     WHERE ((world_members.world_id = world_invitations.world_id) AND (world_members.user_id = ( SELECT auth.uid() AS uid)) AND (world_members.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role])))))));
-- CREATE POLICY "world_invitations: read as manager" ON public.world_invitations AS PERMISSIVE FOR SELECT TO public
--   USING ((EXISTS ( SELECT 1 FROM world_members
--     WHERE ((world_members.world_id = world_invitations.world_id) AND (world_members.user_id = ( SELECT auth.uid() AS uid)) AND (world_members.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role]))))));
-- CREATE POLICY "world_invitations: read own" ON public.world_invitations AS PERMISSIVE FOR SELECT TO public
--   USING (((invitee_id = ( SELECT auth.uid() AS uid)) OR (inviter_id = ( SELECT auth.uid() AS uid))));
-- CREATE POLICY "members: read by world owner" ON public.world_members AS PERMISSIVE FOR SELECT TO authenticated
--   USING (is_world_owner_direct(world_id, ( SELECT auth.uid() AS uid)));
-- CREATE POLICY "members: read roster of own worlds" ON public.world_members AS PERMISSIVE FOR SELECT TO authenticated
--   USING (is_world_member(world_id, ( SELECT auth.uid() AS uid)));
-- CREATE POLICY "worlds: read by invitee" ON public.worlds AS PERMISSIVE FOR SELECT TO public
--   USING ((EXISTS ( SELECT 1 FROM world_invitations WHERE ((world_invitations.world_id = worlds.id) AND (world_invitations.invitee_id = ( SELECT auth.uid() AS uid))))));
-- CREATE POLICY "worlds: read by persona owner" ON public.worlds AS PERMISSIVE FOR SELECT TO public
--   USING ((EXISTS ( SELECT 1 FROM personas WHERE ((personas.world_id = worlds.id) AND (personas.user_id = ( SELECT auth.uid() AS uid))))));
