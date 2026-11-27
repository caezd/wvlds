-- ──────────────────────────────────────────────────────────────────────────
-- 278 — L'en-tête des messages qui se suivent.
--
-- Quand un même persona (joué par le même joueur) poste plusieurs messages à
-- la suite, seul le premier garde son en-tête. Pour les suivants, le lecteur
-- choisit dans ses réglages : « subtle » (un petit avatar dans la marge) ou
-- « hidden » (rien). Préférence de lecture, comme l'alignement du texte.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_header_mode text NOT NULL DEFAULT 'subtle'
    CONSTRAINT profiles_message_header_mode_check CHECK (message_header_mode IN ('subtle', 'hidden'));

-- Les colonnes de `profiles` s'écrivent une à une (migration 089).
GRANT UPDATE (message_header_mode) ON public.profiles TO authenticated;
