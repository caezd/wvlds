-- Migration 065 — Préférence de taille du texte des chatrooms
-- Ajoute une colonne message_text_size sur profiles (confort de lecture, voir /settings).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_text_size TEXT
    CHECK (message_text_size IN ('sm', 'base', 'lg'))
    DEFAULT 'base';
