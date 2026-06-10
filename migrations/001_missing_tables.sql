-- ============================================================
-- Migration 001 — Tables manquantes du projet wvlds
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- Toutes les tables utilisent CREATE TABLE IF NOT EXISTS (safe à rejouer).
-- ============================================================


-- ── 1. persona_sections ──────────────────────────────────────
-- Sections éditables d'un persona (ex : "Informations", "Historique")

CREATE TABLE IF NOT EXISTS public.persona_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id  UUID        NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT '',
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.persona_sections ENABLE ROW LEVEL SECURITY;

-- Propriétaire du persona = propriétaire des sections
CREATE POLICY "sections: owner full access"
  ON public.persona_sections
  FOR ALL
  USING  (
    EXISTS (
      SELECT 1 FROM public.personas
      WHERE personas.id = persona_sections.persona_id
        AND personas.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.personas
      WHERE personas.id = persona_sections.persona_id
        AND personas.user_id = auth.uid()
    )
  );


-- ── 2. persona_section_fields ────────────────────────────────
-- Champs individuels dans une section (type "title" | "text", data JSONB)

CREATE TABLE IF NOT EXISTS public.persona_section_fields (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID        NOT NULL REFERENCES public.persona_sections(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'text' CHECK (type IN ('title', 'text')),
  label       TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.persona_section_fields ENABLE ROW LEVEL SECURITY;

-- Accès via la section → le persona → l'utilisateur
CREATE POLICY "section_fields: owner full access"
  ON public.persona_section_fields
  FOR ALL
  USING  (
    EXISTS (
      SELECT 1
      FROM public.persona_sections ps
      JOIN public.personas p ON p.id = ps.persona_id
      WHERE ps.id = persona_section_fields.section_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.persona_sections ps
      JOIN public.personas p ON p.id = ps.persona_id
      WHERE ps.id = persona_section_fields.section_id
        AND p.user_id = auth.uid()
    )
  );


-- ── 3. world_member_reads ────────────────────────────────────
-- Suivi de la dernière visite d'un membre dans un monde (pour les badges "non-lus")

CREATE TABLE IF NOT EXISTS public.world_member_reads (
  world_id    UUID        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, user_id)
);

ALTER TABLE public.world_member_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_member_reads: owner access"
  ON public.world_member_reads
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 4. world_content_tabs ────────────────────────────────────
-- Onglets de contenu d'un monde (contexte, lore, personnages…)

CREATE TABLE IF NOT EXISTS public.world_content_tabs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  slug        TEXT        NOT NULL,
  label       TEXT        NOT NULL DEFAULT '',
  sort_index  INTEGER     NOT NULL DEFAULT 0,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id, slug)
);

ALTER TABLE public.world_content_tabs ENABLE ROW LEVEL SECURITY;

-- Lecture : membres du monde
CREATE POLICY "world_content_tabs: members read"
  ON public.world_content_tabs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.world_members
      WHERE world_members.world_id = world_content_tabs.world_id
        AND world_members.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.worlds
      WHERE worlds.id = world_content_tabs.world_id
        AND worlds.owner_id = auth.uid()
    )
  );

-- Écriture : propriétaire ou admin du monde
CREATE POLICY "world_content_tabs: owner write"
  ON public.world_content_tabs
  FOR ALL
  USING  (
    EXISTS (
      SELECT 1 FROM public.worlds
      WHERE worlds.id = world_content_tabs.world_id
        AND worlds.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.worlds
      WHERE worlds.id = world_content_tabs.world_id
        AND worlds.owner_id = auth.uid()
    )
  );


-- ── 5. chat_message_reactions ────────────────────────────────
-- Réactions emoji sur les messages de chatroom

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id          BIGSERIAL   PRIMARY KEY,
  message_id  BIGINT      NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  chat_id     UUID        NOT NULL,  -- dénormalisé pour les filtres Realtime
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions: read all in chat"
  ON public.chat_message_reactions
  FOR SELECT USING (true);

CREATE POLICY "reactions: insert own"
  ON public.chat_message_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions: delete own"
  ON public.chat_message_reactions
  FOR DELETE USING (user_id = auth.uid());


-- ── 6. chatroom_reads ────────────────────────────────────────
-- Curseur de lecture par utilisateur par chatroom

CREATE TABLE IF NOT EXISTS public.chatroom_reads (
  chat_id     UUID        NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

ALTER TABLE public.chatroom_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatroom_reads: owner access"
  ON public.chatroom_reads
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 7. chatroom_persona_prefs ────────────────────────────────
-- Persona préférée d'un utilisateur dans chaque chatroom

CREATE TABLE IF NOT EXISTS public.chatroom_persona_prefs (
  chat_id     UUID NOT NULL REFERENCES public.chatrooms(id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  persona_id  UUID NOT NULL REFERENCES public.personas(id)   ON DELETE CASCADE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

ALTER TABLE public.chatroom_persona_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatroom_persona_prefs: owner access"
  ON public.chatroom_persona_prefs
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── Index utiles ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_persona_sections_persona_id
  ON public.persona_sections (persona_id);

CREATE INDEX IF NOT EXISTS idx_persona_section_fields_section_id
  ON public.persona_section_fields (section_id);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message_id
  ON public.chat_message_reactions (message_id);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_chat_id
  ON public.chat_message_reactions (chat_id);

CREATE INDEX IF NOT EXISTS idx_world_content_tabs_world_id
  ON public.world_content_tabs (world_id, sort_index);


-- ── Note : tables probablement déjà existantes ───────────────
-- Les tables suivantes sont utilisées dans le code mais leur création
-- n'est pas incluse ici car elles semblent déjà présentes :
--   personas, chatrooms, chat_messages, worlds, world_members,
--   profiles, user_equipped_cosmetics, cosmetic_items,
--   gamification_balances
