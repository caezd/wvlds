-- ============================================================
-- Migration 273 — Critique et échec critique, options du monde
-- ============================================================
-- Un lancer d'un seul dé à son maximum est un critique, à son minimum un
-- échec critique — si le monde le veut (Paramètres › Jeu › Dés › Lancers).
-- Deux options, décochées par défaut : les valeurs d'un dé n'ont ce sens que
-- dans les jeux qui le décident. Une face en image n'en a jamais (elle dit
-- elle-même son résultat). Le calcul est fait à l'affichage :
-- `diceRollOutcome` (lib/worldDice.ts).

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS dice_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dice_fumble boolean NOT NULL DEFAULT false;

-- Liste blanche des colonnes (migration 258) : l'écriture reste soumise à la
-- policy de mise à jour des mondes (`world.settings`).
GRANT UPDATE (dice_critical, dice_fumble) ON public.worlds TO authenticated;

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN dice_critical, DROP COLUMN dice_fumble;
