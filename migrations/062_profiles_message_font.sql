-- Migration 062 — Préférence de police pour le texte des chatrooms
-- Ajoute une colonne message_font sur profiles pour mémoriser la police choisie
-- par l'utilisateur pour l'affichage des messages (sans-serif par défaut, ou EB Garamond).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_font TEXT
    CHECK (message_font IN ('sans', 'garamond'))
    DEFAULT 'sans';
