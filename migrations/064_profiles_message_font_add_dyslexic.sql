-- Migration 064 — Ajoute l'option de police adaptée dyslexie (OpenDyslexic)
-- aux préférences de lecture des chatrooms.

ALTER TABLE public.profiles DROP CONSTRAINT profiles_message_font_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_message_font_check
    CHECK (message_font IN ('sans', 'serif', 'dyslexic'));
