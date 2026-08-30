-- ============================================================
-- Migration 119 — Retrait du système d'onglets « À propos »
-- ============================================================
-- L'interface qui exploitait `world_content_tabs` (WorldAboutTabs, WorldTabs,
-- WorldTabContent, WorldAddTabDialog) a été remplacée par la grille de blocs de
-- la page d'accueil, puis supprimée du code : plus aucune requête applicative ne
-- touche cette table. Seul le trigger de création de monde continuait d'y
-- insérer deux lignes (« Contexte », « Annexes ») que personne n'affichait ni
-- ne pouvait remplir.
--
-- État constaté avant suppression : 15 lignes sur 8 mondes, dont **0 avec du
-- contenu** (`content` vide ou NULL partout) — aucune donnée utilisateur perdue.
--
-- Aucune clé étrangère ne pointe vers cette table ; ses policies, index et son
-- trigger `trg_touch_updated_at_wct` disparaissent avec elle, de même que son
-- appartenance à la publication `supabase_realtime`.

-- 1) Couper la source : plus aucun monde créé ne se voit doter d'onglets.
DROP TRIGGER IF EXISTS trg_world_defaults_tabs ON public.worlds;
DROP FUNCTION IF EXISTS public.tg_world_defaults_tabs();
DROP FUNCTION IF EXISTS public.ensure_default_world_tabs(uuid, uuid);

-- 2) La table elle-même.
DROP TABLE IF EXISTS public.world_content_tabs;

-- 3) `tg_touch_updated_at` n'était porté que par le trigger de cette table ;
--    il devient orphelin. Ne PAS toucher à `touch_updated_at` (chatrooms) ni à
--    `set_updated_at` (chatroom_categories, patreon_accounts, profiles), qui
--    sont bien vivants — la ressemblance des noms est trompeuse.
DROP FUNCTION IF EXISTS public.tg_touch_updated_at();

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Doit renvoyer 0 partout :
--   SELECT
--     (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='world_content_tabs'),
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--       WHERE n.nspname='public' AND p.proname IN
--         ('tg_world_defaults_tabs','ensure_default_world_tabs','tg_touch_updated_at'));
-- Et les fonctions homonymes conservées doivent toujours être là :
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND proname IN ('touch_updated_at','set_updated_at');

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Irréversible en l'état : la structure se recrée (voir les migrations
-- d'origine), mais les 15 lignes vides ne sont pas restaurables. Elles étaient
-- sans contenu, et le code capable de les afficher n'existe plus.
