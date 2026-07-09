-- ============================================================
-- Migration 076 — Feature flag du bloc "choice" (sondage à cartes)
-- ============================================================
-- Suit le même pattern que block_npc / block_hp (sous-drapeau de
-- chatroom_blocks) : la ligne feature_flags n'est pas créée par une
-- migration de schéma mais insérée directement ici, comme ces deux-là
-- l'ont été (voir la note de désynchronisation dans project_wvlds_refactor).

INSERT INTO public.feature_flags (key, enabled, label, description)
VALUES (
  'block_choice',
  true,
  'Choix (sondage)',
  'Affiche le bloc Choix (sondage à cartes, votable par les autres joueurs) dans le menu des blocs du composer.'
)
ON CONFLICT (key) DO NOTHING;
