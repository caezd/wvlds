-- ============================================================
-- Migration 000 — Complément de socle : 10 tables jamais versionnées
-- ============================================================
-- Ce fichier n'apporte AUCUN changement à la base existante. Il comble un trou
-- dans l'historique : dix tables de production n'apparaissaient nulle part
-- dans le dépôt.
--
-- ── Comment le dépôt reconstruit la base ─────────────────────
--   `.backup`        dump complet du 2026-06-05 (commit « before redesign »)
--   `migrations/*`   les changements appliqués depuis
--
-- Relevé du 2026-08-28, en comparant le schéma réel aux deux sources :
--   51 tables en production
--   13 présentes dans `.backup`
--   35 créées par une migration
--   **10 présentes dans NI l'un NI l'autre**
--
-- Ces dix-là ont été créées directement depuis le tableau de bord Supabase.
-- Rien ne les décrivait : une reconstruction depuis le dépôt produisait une
-- base amputée, dont `chatroom_keys` — qui porte les clés de chiffrement des
-- salons — et `feature_flags`.
--
-- ── Pourquoi le numéro 000 ───────────────────────────────────
-- Les migrations se rejouent dans l'ordre des noms. Ces tables doivent exister
-- AVANT les migrations qui les modifient — la 126 pose des bornes de longueur
-- sur plusieurs d'entre elles, la 120 réécrit les règles d'accès de
-- `chatroom_keys`. Ce fichier n'est pas un changement, c'est du socle : il
-- passe donc en tête.
--
-- ── Idempotence ──────────────────────────────────────────────
-- Tout est écrit pour pouvoir être rejoué sans effet sur une base déjà à jour,
-- ce qui a permis de le vérifier sur la production même : exécuté, il ne
-- modifie rien. Les contraintes passent par un bloc conditionnel plutôt que
-- par DROP/ADD, qui reverrouillerait et revaliderait des tables vivantes.
--
-- Les bornes de longueur ajoutées par la migration 126 ne figurent pas ici :
-- elles appartiennent à la 126, qui s'exécute après.

-- ── Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chatroom_keys (
  chatroom_id uuid NOT NULL,
  key_b64 text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chatroom_follows (
  user_id uuid NOT NULL,
  chatroom_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chat_pins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  chat_id uuid NOT NULL,
  message_id bigint,
  label text,
  pinned_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  label text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.world_persona_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  world_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text NOT NULL,
  sort_index integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.persona_group_assignments (
  persona_id uuid NOT NULL,
  world_id uuid NOT NULL,
  group_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.world_relation_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  world_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text NOT NULL,
  dash text DEFAULT ''::text NOT NULL,
  sort_index integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.persona_relations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  world_id uuid NOT NULL,
  from_persona_id uuid NOT NULL,
  to_persona_id uuid NOT NULL,
  type text DEFAULT 'ally'::text NOT NULL,
  label text,
  bidirectional boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS public.user_canvas_positions (
  user_id uuid NOT NULL,
  world_id uuid NOT NULL,
  x real DEFAULT 0 NOT NULL,
  y real DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.world_lexicon_terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  world_id uuid NOT NULL,
  term text NOT NULL,
  description text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Contraintes ──────────────────────────────────────────────
-- Ajoutées seulement si absentes : un DROP/ADD reverrouillerait et
-- revaliderait des tables en service.

DO $$
DECLARE
  d text;
BEGIN
  FOREACH d IN ARRAY ARRAY[
    'chatroom_keys|chatroom_keys_pkey|PRIMARY KEY (chatroom_id)',
    'chatroom_keys|chatroom_keys_chatroom_id_fkey|FOREIGN KEY (chatroom_id) REFERENCES public.chatrooms(id) ON DELETE CASCADE',

    'chatroom_follows|chatroom_follows_pkey|PRIMARY KEY (user_id, chatroom_id)',
    'chatroom_follows|chatroom_follows_chatroom_id_fkey|FOREIGN KEY (chatroom_id) REFERENCES public.chatrooms(id) ON DELETE CASCADE',
    'chatroom_follows|chatroom_follows_user_id_fkey|FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',

    'chat_pins|chat_pins_pkey|PRIMARY KEY (id)',
    'chat_pins|chat_pins_chat_id_fkey|FOREIGN KEY (chat_id) REFERENCES public.chatrooms(id) ON DELETE CASCADE',
    'chat_pins|chat_pins_message_id_fkey|FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE',
    'chat_pins|chat_pins_pinned_by_fkey|FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE CASCADE',

    'feature_flags|feature_flags_pkey|PRIMARY KEY (key)',

    'world_persona_groups|world_persona_groups_pkey|PRIMARY KEY (id)',
    'world_persona_groups|world_persona_groups_world_id_fkey|FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE',

    'persona_group_assignments|persona_group_assignments_pkey|PRIMARY KEY (persona_id, world_id)',
    'persona_group_assignments|persona_group_assignments_group_id_fkey|FOREIGN KEY (group_id) REFERENCES public.world_persona_groups(id) ON DELETE CASCADE',
    'persona_group_assignments|persona_group_assignments_persona_id_fkey|FOREIGN KEY (persona_id) REFERENCES public.personas(id) ON DELETE CASCADE',
    'persona_group_assignments|persona_group_assignments_world_id_fkey|FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE',

    'world_relation_types|world_relation_types_pkey|PRIMARY KEY (id)',
    'world_relation_types|world_relation_types_world_id_fkey|FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE',

    'persona_relations|persona_relations_pkey|PRIMARY KEY (id)',
    'persona_relations|unique_relation|UNIQUE (world_id, from_persona_id, to_persona_id)',
    'persona_relations|no_self_relation|CHECK (from_persona_id <> to_persona_id)',
    'persona_relations|persona_relations_created_by_fkey|FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL',
    'persona_relations|persona_relations_from_persona_id_fkey|FOREIGN KEY (from_persona_id) REFERENCES public.personas(id) ON DELETE CASCADE',
    'persona_relations|persona_relations_to_persona_id_fkey|FOREIGN KEY (to_persona_id) REFERENCES public.personas(id) ON DELETE CASCADE',
    'persona_relations|persona_relations_world_id_fkey|FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE',

    'user_canvas_positions|user_canvas_positions_pkey|PRIMARY KEY (user_id, world_id)',
    'user_canvas_positions|user_canvas_positions_world_id_fkey|FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE',

    'world_lexicon_terms|world_lexicon_terms_pkey|PRIMARY KEY (id)',
    'world_lexicon_terms|world_lexicon_terms_world_id_fkey|FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = split_part(d, '|', 2)
        AND conrelid = ('public.' || split_part(d, '|', 1))::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s',
                     split_part(d, '|', 1), split_part(d, '|', 2), split_part(d, '|', 3));
    END IF;
  END LOOP;
END $$;

-- ── Index ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS chat_pins_chat_id_idx
  ON public.chat_pins USING btree (chat_id, created_at);
CREATE INDEX IF NOT EXISTS chat_pins_message_id_idx
  ON public.chat_pins USING btree (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS world_lexicon_terms_world_term_idx
  ON public.world_lexicon_terms USING btree (world_id, lower(term));
CREATE INDEX IF NOT EXISTS world_lexicon_terms_world_id_idx
  ON public.world_lexicon_terms USING btree (world_id);

-- ── Sécurité au niveau ligne ─────────────────────────────────
-- Sans cette activation, une base reconstruite exposerait les dix tables en
-- lecture ET en écriture à tout le monde. `chatroom_keys` en fait partie.

ALTER TABLE public.chat_pins                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatroom_follows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatroom_keys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_relations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_canvas_positions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_lexicon_terms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_persona_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_relation_types      ENABLE ROW LEVEL SECURITY;

-- ── Règles d'accès ───────────────────────────────────────────
-- Reprises telles qu'elles sont aujourd'hui, migrations 116 et 120 comprises.
-- Les rejouer plus tard est sans effet : ces migrations font toutes un
-- `DROP POLICY IF EXISTS` avant de recréer.

DROP POLICY IF EXISTS "chatroom_keys_select" ON public.chatroom_keys;
CREATE POLICY "chatroom_keys_select" ON public.chatroom_keys
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chatrooms c
                 WHERE c.id = chatroom_keys.chatroom_id
                   AND is_world_member(c.world_id, (select auth.uid()))));

DROP POLICY IF EXISTS "chatroom_keys_insert" ON public.chatroom_keys;
CREATE POLICY "chatroom_keys_insert" ON public.chatroom_keys
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.chatrooms c
                      WHERE c.id = chatroom_keys.chatroom_id
                        AND is_world_member(c.world_id, (select auth.uid()))));

DROP POLICY IF EXISTS "users can manage own chatroom follows" ON public.chatroom_follows;
CREATE POLICY "users can manage own chatroom follows" ON public.chatroom_follows
  FOR ALL TO public
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "chat_pins: membres peuvent lire" ON public.chat_pins;
CREATE POLICY "chat_pins: membres peuvent lire" ON public.chat_pins
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.chatrooms c
                 JOIN public.world_members wm ON wm.world_id = c.world_id
                 WHERE c.id = chat_pins.chat_id AND wm.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "chat_pins: authentifiés peuvent épingler" ON public.chat_pins;
CREATE POLICY "chat_pins: authentifiés peuvent épingler" ON public.chat_pins
  FOR INSERT TO public WITH CHECK (pinned_by = (select auth.uid()));

DROP POLICY IF EXISTS "chat_pins: épingleur peut supprimer" ON public.chat_pins;
CREATE POLICY "chat_pins: épingleur peut supprimer" ON public.chat_pins
  FOR DELETE TO public USING (pinned_by = (select auth.uid()));

DROP POLICY IF EXISTS "feature_flags: read by authenticated" ON public.feature_flags;
CREATE POLICY "feature_flags: read by authenticated" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feature_flags: write by admin" ON public.feature_flags;
CREATE POLICY "feature_flags: write by admin" ON public.feature_flags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles
                 WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles
                      WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true));

DROP POLICY IF EXISTS "members_read_groups" ON public.world_persona_groups;
CREATE POLICY "members_read_groups" ON public.world_persona_groups
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.world_members wm
                 WHERE wm.world_id = world_persona_groups.world_id AND wm.user_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = world_persona_groups.world_id AND w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "owner_manage_groups" ON public.world_persona_groups;
CREATE POLICY "owner_manage_groups" ON public.world_persona_groups
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = world_persona_groups.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm
                 WHERE wm.world_id = world_persona_groups.world_id
                   AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role));

DROP POLICY IF EXISTS "members_read_assignments" ON public.persona_group_assignments;
CREATE POLICY "members_read_assignments" ON public.persona_group_assignments
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.world_members wm
                 WHERE wm.world_id = persona_group_assignments.world_id AND wm.user_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = persona_group_assignments.world_id AND w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "manage_assignments" ON public.persona_group_assignments;
CREATE POLICY "manage_assignments" ON public.persona_group_assignments
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = persona_group_assignments.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm
                 WHERE wm.world_id = persona_group_assignments.world_id
                   AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
      OR EXISTS (SELECT 1 FROM public.personas p
                 WHERE p.id = persona_group_assignments.persona_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "rel_types_select" ON public.world_relation_types;
CREATE POLICY "rel_types_select" ON public.world_relation_types
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = world_relation_types.world_id
                   AND (w.owner_id = (select auth.uid())
                        OR EXISTS (SELECT 1 FROM public.world_members wm
                                   WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "rel_types_owner_write" ON public.world_relation_types;
CREATE POLICY "rel_types_owner_write" ON public.world_relation_types
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = world_relation_types.world_id AND w.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.worlds w
                      WHERE w.id = world_relation_types.world_id AND w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "members_read_relations" ON public.persona_relations;
CREATE POLICY "members_read_relations" ON public.persona_relations
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.world_members wm
                 WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "players_create_relations" ON public.persona_relations;
CREATE POLICY "players_create_relations" ON public.persona_relations
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.worlds w
                      WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
           OR EXISTS (SELECT 1 FROM public.world_members wm
                      WHERE wm.world_id = persona_relations.world_id
                        AND wm.user_id = (select auth.uid())
                        AND wm.role = ANY (ARRAY['admin'::world_role, 'editor'::world_role, 'player'::world_role])));

DROP POLICY IF EXISTS "players_delete_relations" ON public.persona_relations;
CREATE POLICY "players_delete_relations" ON public.persona_relations
  FOR DELETE TO public
  USING (created_by = (select auth.uid())
      OR EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm
                 WHERE wm.world_id = persona_relations.world_id
                   AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role));

DROP POLICY IF EXISTS "canvas_pos_select" ON public.user_canvas_positions;
CREATE POLICY "canvas_pos_select" ON public.user_canvas_positions
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = user_canvas_positions.world_id
                   AND (w.owner_id = (select auth.uid())
                        OR EXISTS (SELECT 1 FROM public.world_members wm
                                   WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "canvas_pos_write" ON public.user_canvas_positions;
CREATE POLICY "canvas_pos_write" ON public.user_canvas_positions
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.worlds w
                 WHERE w.id = user_canvas_positions.world_id
                   AND (w.owner_id = (select auth.uid())
                        OR EXISTS (SELECT 1 FROM public.world_members wm
                                   WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.worlds w
                      WHERE w.id = user_canvas_positions.world_id
                        AND (w.owner_id = (select auth.uid())
                             OR EXISTS (SELECT 1 FROM public.world_members wm
                                        WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "wlt_select" ON public.world_lexicon_terms;
CREATE POLICY "wlt_select" ON public.world_lexicon_terms
  FOR SELECT TO public USING (is_world_member(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wlt_insert" ON public.world_lexicon_terms;
CREATE POLICY "wlt_insert" ON public.world_lexicon_terms
  FOR INSERT TO public WITH CHECK (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wlt_update" ON public.world_lexicon_terms;
CREATE POLICY "wlt_update" ON public.world_lexicon_terms
  FOR UPDATE TO public USING (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wlt_delete" ON public.world_lexicon_terms;
CREATE POLICY "wlt_delete" ON public.world_lexicon_terms
  FOR DELETE TO public USING (is_world_editor(world_id, (select auth.uid())));

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Exécuté sur la production, ce fichier ne doit RIEN changer : mêmes nombres
-- de tables, de contraintes, d'index et de policies avant et après.
--
-- Ce qui n'a PAS été vérifié, faute d'une base de rejeu : que `.backup` +
-- `migrations/*` reconstruisent à l'identique. Ce fichier supprime le trou
-- connu ; il ne prouve pas l'absence d'autres écarts (colonnes ajoutées à la
-- main sur une table existante, par exemple, qu'aucune comparaison de noms
-- ne peut détecter).
