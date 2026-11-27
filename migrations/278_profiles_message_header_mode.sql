-- ──────────────────────────────────────────────────────────────────────────
-- 278 — L'en-tête des messages qui se suivent.
--
-- Quand un même persona (joué par le même joueur) poste plusieurs messages à
-- la suite, seul le premier garde son en-tête. Pour les suivants, le lecteur
-- choisit dans ses réglages : « subtle » (un petit avatar dans la marge) ou
-- « hidden » (rien). Préférence de lecture, comme l'alignement du texte.
--
-- Remplacée le jour même par un choix propre à chaque message
-- (`chat_messages.metadata.header`) : la colonne n'est plus lue. Elle reste
-- le temps que la version déployée cesse de la lire.
-- DROP après déploiement :
--   ALTER TABLE public.profiles DROP COLUMN message_header_mode;
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_header_mode text NOT NULL DEFAULT 'subtle'
    CONSTRAINT profiles_message_header_mode_check CHECK (message_header_mode IN ('subtle', 'hidden'));

-- Les colonnes de `profiles` s'écrivent une à une (migration 089).
GRANT UPDATE (message_header_mode) ON public.profiles TO authenticated;
