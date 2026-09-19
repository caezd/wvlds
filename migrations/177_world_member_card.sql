-- ============================================================
-- Migration 177 — La carte d'un membre dans un monde, et son statut
-- ============================================================
-- Un membre n'était dans un monde qu'un pseudo et un rôle. Il y gagne une
-- carte propre à CE monde — présentation, disponibilités, fuseau horaire,
-- anniversaire (jour et mois, jamais l'année) — et un statut de joueur :
-- actif, en pause, absent jusqu'à une date, avec un mot d'explication.
--
-- ── 1. Les colonnes ──────────────────────────────────────────
-- Sur `world_members`, avec des bornes de texte (miroir dans
-- `lib/textLimits.ts`) et un anniversaire cohérent (mois et jour ensemble).
--
-- ── 2. Qui écrit quoi ────────────────────────────────────────
-- La politique UPDATE s'ouvre au membre lui-même. Elle ne dit pas QUOI il
-- peut changer : un déclencheur BEFORE UPDATE s'en charge —
--   · `world_id`, `user_id`, `role`, `joined_at`, `age_confirmed_at` ne se
--     modifient jamais par une écriture directe (la confirmation d'âge passe
--     par `confirm_world_age`, SECURITY DEFINER, que le déclencheur laisse
--     passer : elle ne s'exécute pas sous le rôle `authenticated`) ;
--   · un gestionnaire (`members.manage`, rang supérieur) ne touche qu'au
--     statut d'un autre membre, jamais à sa carte.
--
-- ── 3. L'activité ────────────────────────────────────────────
-- `get_world_member_activity(p_world_id)` : nombre de messages et date du
-- dernier, par membre, pour les membres du monde. Même motif que
-- `get_chatroom_stats` (130), à l'échelle du monde ; l'index
-- `idx_chat_messages_world_author_persona` couvre l'agrégat.

-- ── 1. Les colonnes ──────────────────────────────────────────

ALTER TABLE public.world_members
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_until   date,
  ADD COLUMN IF NOT EXISTS status_note    text,
  ADD COLUMN IF NOT EXISTS bio            text,
  ADD COLUMN IF NOT EXISTS availability   text,
  ADD COLUMN IF NOT EXISTS timezone       text,
  ADD COLUMN IF NOT EXISTS birthday_month smallint,
  ADD COLUMN IF NOT EXISTS birthday_day   smallint;

ALTER TABLE public.world_members
  ADD CONSTRAINT world_members_status_check CHECK (status IN ('active', 'paused', 'away'));
ALTER TABLE public.world_members ADD CONSTRAINT world_members_status_note_len CHECK (char_length(status_note) <= 120);
ALTER TABLE public.world_members ADD CONSTRAINT world_members_bio_len CHECK (char_length(bio) <= 500);
ALTER TABLE public.world_members ADD CONSTRAINT world_members_availability_len CHECK (char_length(availability) <= 120);
ALTER TABLE public.world_members ADD CONSTRAINT world_members_timezone_len CHECK (char_length(timezone) <= 64);
ALTER TABLE public.world_members
  ADD CONSTRAINT world_members_birthday_month_range CHECK (birthday_month IS NULL OR birthday_month BETWEEN 1 AND 12),
  ADD CONSTRAINT world_members_birthday_day_range CHECK (birthday_day IS NULL OR birthday_day BETWEEN 1 AND 31),
  ADD CONSTRAINT world_members_birthday_pair CHECK ((birthday_month IS NULL) = (birthday_day IS NULL));

-- ── 2. Qui écrit quoi ────────────────────────────────────────

-- SECURITY INVOKER, à dessein : `current_user` doit rester celui de l'appel,
-- `authenticated` pour une écriture directe, le propriétaire de la fonction
-- pour une RPC SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.tg_world_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Les fonctions SECURITY DEFINER (confirm_world_age…) s'exécutent sous leur
  -- propriétaire : elles ne sont pas concernées.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.world_id <> OLD.world_id
     OR NEW.user_id <> OLD.user_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.age_confirmed_at IS DISTINCT FROM OLD.age_confirmed_at THEN
    RAISE EXCEPTION 'Ces colonnes de world_members ne se modifient pas par une écriture directe.';
  END IF;

  -- Un gestionnaire ne change que le statut d'un autre membre.
  IF auth.uid() IS DISTINCT FROM OLD.user_id AND (
       NEW.bio IS DISTINCT FROM OLD.bio
    OR NEW.availability IS DISTINCT FROM OLD.availability
    OR NEW.timezone IS DISTINCT FROM OLD.timezone
    OR NEW.birthday_month IS DISTINCT FROM OLD.birthday_month
    OR NEW.birthday_day IS DISTINCT FROM OLD.birthday_day) THEN
    RAISE EXCEPTION 'Seul le membre modifie sa carte.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_members_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_members_guard ON public.world_members;
CREATE TRIGGER trg_world_members_guard
  BEFORE UPDATE ON public.world_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_members_guard();

DROP POLICY IF EXISTS "world_members_update" ON public.world_members;
CREATE POLICY "world_members_update" ON public.world_members FOR UPDATE TO authenticated USING (
  user_id = (select auth.uid())
  OR (public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
      AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid())))
) WITH CHECK (
  user_id = (select auth.uid())
  OR (public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
      AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid())))
);

-- ── 3. L'activité ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_world_member_activity(p_world_id uuid)
RETURNS TABLE(user_id uuid, message_count bigint, last_message_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.author_id AS user_id, count(*) AS message_count, max(m.created_at) AS last_message_at
    FROM public.chat_messages m
   WHERE m.world_id = p_world_id
     AND m.author_id IS NOT NULL
     AND (public.is_world_member(p_world_id, auth.uid()) OR public.is_world_owner_direct(p_world_id, auth.uid()))
   GROUP BY m.author_id
$$;
REVOKE ALL ON FUNCTION public.get_world_member_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_member_activity(uuid) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT status, count(*) FROM public.world_members GROUP BY 1;             -- → active : tous
-- SELECT * FROM public.get_world_member_activity('<world>');               -- → une ligne par auteur
-- En tant que membre : UPDATE world_members SET role = 'admin' WHERE …     -- → refusé par le déclencheur

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION public.get_world_member_activity(uuid);
-- DROP TRIGGER trg_world_members_guard ON public.world_members; DROP FUNCTION public.tg_world_members_guard();
-- Rejouer `world_members_update` de la migration 176, puis DROP COLUMN des huit colonnes.
