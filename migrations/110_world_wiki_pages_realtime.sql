-- ============================================================
-- Migration 110 — Realtime pour les pages du wiki
-- ============================================================
-- `world_wiki_pages` (migration 016) n'avait jamais été ajoutée à la
-- publication `supabase_realtime` — même classe de bug que la migration 108
-- pour `chatroom_categories`, corrigée ici avant qu'elle ne cause le même
-- symptôme (UI figée jusqu'au rechargement de la page).

ALTER PUBLICATION supabase_realtime ADD TABLE public.world_wiki_pages;

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_wiki_pages;
