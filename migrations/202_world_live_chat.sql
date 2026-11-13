-- ─────────────────────────────────────────────────────────────
-- Migration 202 — Chat en direct d'un monde
--
-- Un fil de discussion hors-jeu par monde, ouvert depuis une barre au bas
-- de toutes les pages du monde (accueil, onglets, salons). Les messages sont
-- signés par le compte, pas par un persona, et ne sont pas chiffrés : c'est
-- une conversation de passage, pas un récit.
--
-- 1. `world_live_messages` : texte court (500 caractères), lu et écrit par
--    les seuls membres ; l'auteur ou `members.manage` peut effacer.
-- 2. Un rythme minimal (une seconde entre deux messages d'un même compte
--    dans un même monde) et une rétention bornée aux 500 derniers messages
--    du monde, tenus par trigger.
-- 3. La table rejoint la publication temps réel.
-- 4. Drapeau `world_live_chat`, éteint par défaut.
-- ─────────────────────────────────────────────────────────────

-- ── 1. La table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_live_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Bornes de longueur : voir lib/textLimits.ts.
ALTER TABLE public.world_live_messages ADD CONSTRAINT world_live_messages_content_nonempty CHECK (btrim(content) <> '');
ALTER TABLE public.world_live_messages ADD CONSTRAINT world_live_messages_content_len CHECK (char_length(content) <= 500);
CREATE INDEX IF NOT EXISTS world_live_messages_world_created_idx
  ON public.world_live_messages (world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS world_live_messages_user_idx
  ON public.world_live_messages (user_id, world_id, created_at DESC);

-- ── 2. Rythme et rétention ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_live_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- L'horodatage vient du serveur, jamais du client.
  NEW.created_at := now();
  IF EXISTS (
    SELECT 1 FROM public.world_live_messages m
     WHERE m.world_id = NEW.world_id
       AND m.user_id = NEW.user_id
       AND m.created_at > now() - interval '1 second'
  ) THEN
    RAISE EXCEPTION 'Trop de messages : patientez un instant.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_message_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_live_message_insert ON public.world_live_messages;
CREATE TRIGGER trg_world_live_message_insert
  BEFORE INSERT ON public.world_live_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_live_message_insert();

-- Ne garde que les 500 derniers messages du monde. Le seuil se lit sur
-- l'index (world_id, created_at DESC) : un saut de 500 lignes, pas un tri.
CREATE OR REPLACE FUNCTION public.tg_world_live_message_prune()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  SELECT m.created_at INTO v_cutoff
    FROM public.world_live_messages m
   WHERE m.world_id = NEW.world_id
   ORDER BY m.created_at DESC
  OFFSET 500 LIMIT 1;
  IF v_cutoff IS NOT NULL THEN
    DELETE FROM public.world_live_messages m
     WHERE m.world_id = NEW.world_id AND m.created_at <= v_cutoff;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_message_prune() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_live_message_prune ON public.world_live_messages;
CREATE TRIGGER trg_world_live_message_prune
  AFTER INSERT ON public.world_live_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_live_message_prune();

-- ── RLS : une politique par action ───────────────────────────
ALTER TABLE public.world_live_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS world_live_messages_select ON public.world_live_messages;
CREATE POLICY world_live_messages_select ON public.world_live_messages
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (select auth.uid())));

DROP POLICY IF EXISTS world_live_messages_insert ON public.world_live_messages;
CREATE POLICY world_live_messages_insert ON public.world_live_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.is_world_member(world_id, (select auth.uid()))
  );

-- Pas d'UPDATE : un message du direct ne se modifie pas.

DROP POLICY IF EXISTS world_live_messages_delete ON public.world_live_messages;
CREATE POLICY world_live_messages_delete ON public.world_live_messages
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  );

GRANT SELECT, INSERT, DELETE ON public.world_live_messages TO authenticated;
REVOKE ALL ON public.world_live_messages FROM anon;

-- ── 3. Temps réel ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'world_live_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_live_messages;
  END IF;
END $$;

-- ── 4. Drapeau ───────────────────────────────────────────────
INSERT INTO public.feature_flags (key, enabled, label, description)
VALUES (
  'world_live_chat',
  false,
  'Chat en direct des mondes',
  'Barre de discussion hors-jeu au bas des pages d''un monde : dernier message, membres présents, panneau dépliable.'
)
ON CONFLICT (key) DO NOTHING;
