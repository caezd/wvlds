-- Édition et suppression de ses propres messages en DM.
--
-- dm_messages n'avait que SELECT/INSERT (migrations 041/101) : l'auteur ne
-- pouvait ni corriger une coquille ni retirer un message envoyé par erreur.
-- Le canal realtime « conversations » écoutait déjà UPDATE/DELETE sur cette
-- table depuis le départ (DmsProvider.tsx, commentaire « pas d'UI aujourd'hui,
-- mais possible ») : il ne manquait que les policies pour que ça devienne
-- utilisable. La table est déjà dans la publication supabase_realtime sans
-- restriction d'événement (migration 041), donc UPDATE/DELETE sont diffusés
-- sans changement de ce côté.
--
-- Pas de colonne "edited_at" : chat_messages (chatrooms) n'en a pas non plus,
-- l'édition y est silencieuse — même comportement ici pour rester cohérent.

CREATE POLICY "dm_messages_update" ON dm_messages
  FOR UPDATE USING (author_id = (SELECT auth.uid()))
  WITH CHECK (author_id = (SELECT auth.uid()));

CREATE POLICY "dm_messages_delete" ON dm_messages
  FOR DELETE USING (author_id = (SELECT auth.uid()));

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP POLICY "dm_messages_update" ON dm_messages;
-- DROP POLICY "dm_messages_delete" ON dm_messages;
