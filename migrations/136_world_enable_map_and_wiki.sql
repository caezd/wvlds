-- ============================================================
-- Migration 136 — Carte et wiki activables par monde
-- ============================================================
-- Jusqu'ici, la carte n'était gouvernée que par le drapeau GLOBAL `world_map`,
-- et le wiki par rien du tout : tous les mondes les exposaient, qu'ils s'en
-- servent ou non. Les autres fonctionnalités — inventaire, compétences,
-- faceclaims, chronologie — ont chacune leur interrupteur par monde.
--
-- Ces deux colonnes complètent la série, sur le même modèle que
-- `enable_inventory` et `enable_skills`.
--
-- ── Défaut à `true`, délibérément ────────────────────────────
-- Les mondes existants gardent leur carte et leur wiki. Un défaut à `false`
-- ferait disparaître, à la mise à jour, du contenu déjà écrit — 6 pages de wiki
-- et 1 carte sont déjà en base, sur 8 mondes.
--
-- `NOT NULL` plutôt que nullable : les colonnes voisines sont nullables et
-- obligent tous leurs lecteurs à écrire `!== false` pour traiter `null` comme
-- « activé ». Ici la valeur est toujours renseignée, la lecture est directe.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS enable_map  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_wiki boolean NOT NULL DEFAULT true;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT count(*) FILTER (WHERE enable_map),
--          count(*) FILTER (WHERE enable_wiki),
--          count(*)
--     FROM public.worlds;               -- les trois doivent être égaux
--
-- Aucune policy à ajouter : `worlds` est déjà couverte, et ces colonnes suivent
-- les mêmes règles d'écriture que les autres réglages du monde
-- (« worlds update by admin » et « worlds: owner can update »).
