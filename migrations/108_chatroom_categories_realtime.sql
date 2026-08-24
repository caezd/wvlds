-- ============================================================
-- Migration 108 — Realtime pour les catégories de chatrooms
-- ============================================================
-- `chatroom_categories` (migration 040) n'avait jamais été ajoutée à la
-- publication `supabase_realtime` : modifier une catégorie (titre, image,
-- description) s'enregistrait bien en base mais ne se reflétait pas en
-- direct côté clients déjà connectés — il fallait recharger la page.

ALTER PUBLICATION supabase_realtime ADD TABLE public.chatroom_categories;

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.chatroom_categories;
