-- ============================================================
-- Migration 146 — Journal d'erreurs joint aux rapports de bug
-- ============================================================
-- Un signalement dit « ça a planté » ; ce journal dit quoi. Les deux frontières
-- d'erreur de l'application affichent l'incident puis l'oublient, et le
-- `digest` qu'elles montrent ne couvre que le rendu serveur : côté navigateur,
-- rien ne subsistait au moment où l'utilisateur ouvre le formulaire.
--
-- JSONB et non du texte : chaque entrée porte son horodatage, son origine, son
-- message et sa pile. La file de tri les affiche séparément, et la date dit si
-- l'erreur est celle qu'on signale ou une trace plus ancienne de la session.

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS client_errors JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Le journal est alimenté par le client, comme le reste de la table. Trois
-- bornes, dont aucune n'exige de sous-requête (voir migration 145) : c'est bien
-- un tableau, il ne dépasse pas dix entrées, et son poids total reste celui
-- d'un contexte — pas d'une pièce jointe déguisée.
ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_client_errors_bounds;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_client_errors_bounds CHECK (
    jsonb_typeof(client_errors) = 'array'
    AND jsonb_array_length(client_errors) <= 10
    AND length(client_errors::text) <= 25000
  );
