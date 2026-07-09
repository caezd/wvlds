-- Migration 077 — Préférence d'alignement du texte des chatrooms
-- Ajoute une colonne message_text_align sur profiles (confort de lecture, voir /settings).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_text_align TEXT
    CHECK (message_text_align IN ('left', 'justify'))
    DEFAULT 'left';
