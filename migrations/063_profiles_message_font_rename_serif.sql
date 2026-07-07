-- Migration 063 — Renomme la valeur 'garamond' en 'serif' pour message_font
-- L'option n'est plus liée au nom d'une police précise (EB Garamond → Source Serif),
-- la valeur en base ne doit donc pas non plus le référencer.

ALTER TABLE public.profiles DROP CONSTRAINT profiles_message_font_check;

UPDATE public.profiles SET message_font = 'serif' WHERE message_font = 'garamond';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_message_font_check
    CHECK (message_font IN ('sans', 'serif'));
