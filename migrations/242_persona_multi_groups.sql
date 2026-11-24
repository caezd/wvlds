-- ============================================================
-- Migration 242 — Plusieurs groupes par persona, groupe principal
-- ============================================================
-- Un persona n'appartenait qu'à un groupe par monde (clé
-- `(persona_id, world_id)` de `persona_group_assignments`). Il peut désormais
-- en rejoindre plusieurs ; l'un d'eux est son groupe principal, celui dont il
-- montre la couleur.
--
-- ── 1. Description d'un groupe ───────────────────────────────
-- `world_persona_groups.description`, facultative, 1 000 caractères au plus.
--
-- ── 2. Clé et groupe principal ───────────────────────────────
--   clé          `(persona_id, group_id)` : une ligne par groupe rejoint.
--   is_primary   au plus un groupe principal par persona et par monde (index
--                unique partiel). Les affectations existantes, toutes
--                uniques, deviennent principales.
--
-- ── 3. Cohérence (trigger `tg_persona_group_assignments_before`) ──
--   - le groupe et le persona appartiennent au monde de la ligne ;
--   - le premier groupe rejoint devient principal ;
--   - désigner un groupe comme principal retire ce rang aux autres : un
--     simple UPDATE `is_primary = true` suffit côté client.
-- Quitter son groupe principal fait monter le premier des groupes restants
-- (trigger `tg_persona_group_assignments_promote`, ordre du monde).
--
-- ── 4. Teinte ────────────────────────────────────────────────
-- La chronologie (`get_chatroom_personas`, `get_chatroom_openers`) lit la
-- couleur du seul groupe principal. Les accès aux salons privés et les
-- invitations (migration 232) cherchaient déjà « une affectation dans ce
-- groupe ou un sous-groupe » : ils valent sans changement pour plusieurs
-- groupes.
--
-- Les règles d'accès ne changent pas (`relations.manage`, ou le propriétaire
-- du persona). Les deux triggers sont SECURITY DEFINER : ils ne touchent que
-- les lignes du persona et du monde de la ligne écrite, que la RLS a déjà
-- filtrée (un INSERT refusé annule aussi ce qu'ils ont fait), et la
-- vérification du monde doit voir le persona même quand la RLS le cache.

-- ── 1. Description ───────────────────────────────────────────

ALTER TABLE public.world_persona_groups ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.world_persona_groups ADD CONSTRAINT world_persona_groups_description_len CHECK (char_length(description) <= 1000);

-- ── 2. Clé et groupe principal ───────────────────────────────

ALTER TABLE public.persona_group_assignments
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Avant la migration, chaque persona n'avait qu'une ligne par monde.
UPDATE public.persona_group_assignments SET is_primary = true WHERE NOT is_primary;

ALTER TABLE public.persona_group_assignments DROP CONSTRAINT IF EXISTS persona_group_assignments_pkey;
ALTER TABLE public.persona_group_assignments ADD CONSTRAINT persona_group_assignments_pkey PRIMARY KEY (persona_id, group_id);

-- Les lectures par persona dans un monde (fiche, teinte, déclencheurs).
CREATE INDEX IF NOT EXISTS persona_group_assignments_persona_world_idx
  ON public.persona_group_assignments (persona_id, world_id);

CREATE UNIQUE INDEX IF NOT EXISTS persona_group_assignments_one_primary
  ON public.persona_group_assignments (persona_id, world_id) WHERE is_primary;

-- ── 3. Cohérence ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_persona_group_assignments_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.world_id IS DISTINCT FROM OLD.world_id OR NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.world_persona_groups g WHERE g.id = NEW.group_id AND g.world_id = NEW.world_id
    ) THEN
      RAISE EXCEPTION 'Ce groupe n''appartient pas au monde.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.personas p WHERE p.id = NEW.persona_id AND p.world_id = NEW.world_id
    ) THEN
      RAISE EXCEPTION 'Ce persona n''appartient pas au monde.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Le premier groupe rejoint devient principal.
  IF TG_OP = 'INSERT' AND NOT NEW.is_primary AND NOT EXISTS (
    SELECT 1 FROM public.persona_group_assignments a
     WHERE a.persona_id = NEW.persona_id AND a.world_id = NEW.world_id AND a.is_primary
  ) THEN
    NEW.is_primary := true;
  END IF;

  -- Un nouveau groupe principal retire ce rang à l'ancien. L'UPDATE ci-dessous
  -- ne passe à `false` que des lignes qui étaient principales : il revient
  -- dans ce trigger sans rien y faire.
  IF NEW.is_primary AND (TG_OP = 'INSERT' OR NOT OLD.is_primary) THEN
    UPDATE public.persona_group_assignments a
       SET is_primary = false
     WHERE a.persona_id = NEW.persona_id AND a.world_id = NEW.world_id
       AND a.group_id <> NEW.group_id AND a.is_primary;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_persona_group_assignments_before() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS persona_group_assignments_before ON public.persona_group_assignments;
CREATE TRIGGER persona_group_assignments_before
  BEFORE INSERT OR UPDATE ON public.persona_group_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_group_assignments_before();

CREATE OR REPLACE FUNCTION public.tg_persona_group_assignments_promote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT OLD.is_primary THEN
    RETURN NULL;
  END IF;
  UPDATE public.persona_group_assignments a
     SET is_primary = true
   WHERE (a.persona_id, a.group_id) = (
     SELECT a2.persona_id, a2.group_id
       FROM public.persona_group_assignments a2
       JOIN public.world_persona_groups g ON g.id = a2.group_id
      WHERE a2.persona_id = OLD.persona_id AND a2.world_id = OLD.world_id
      ORDER BY g.sort_index, g.created_at, g.id
      LIMIT 1
   );
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_persona_group_assignments_promote() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS persona_group_assignments_promote ON public.persona_group_assignments;
CREATE TRIGGER persona_group_assignments_promote
  AFTER DELETE ON public.persona_group_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_group_assignments_promote();

-- ── 4. Teinte : la chronologie lit le groupe principal ───────

CREATE OR REPLACE FUNCTION public.get_chatroom_personas(p_world_id uuid)
RETURNS TABLE(chat_id uuid, persona_id uuid, persona_name text, group_color text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT a.chat_id, a.persona_id, p.name, public.persona_group_tint(ga.group_id)
    FROM public.chatroom_persona_authors a
    JOIN public.chatrooms c ON c.id = a.chat_id AND c.timeline_date IS NOT NULL
    JOIN public.personas p ON p.id = a.persona_id
    LEFT JOIN public.persona_group_assignments ga
      ON ga.persona_id = a.persona_id AND ga.world_id = a.world_id AND ga.is_primary
   WHERE a.world_id = p_world_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_chatroom_openers(p_world_id uuid)
RETURNS TABLE(chat_id uuid, author_name text, persona_name text, group_color text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT c.id,
         pr.username,
         p.name,
         public.persona_group_tint(a.group_id)
    FROM public.chatrooms c
    LEFT JOIN LATERAL (
      SELECT m.persona_id, m.author_id
        FROM public.chat_messages m
       WHERE m.chat_id = c.id
       ORDER BY m.created_at, m.id
       LIMIT 1
    ) first ON true
    LEFT JOIN public.profiles pr ON pr.id = COALESCE(first.author_id, c.created_by)
    LEFT JOIN public.personas p ON p.id = first.persona_id
    LEFT JOIN public.persona_group_assignments a
      ON a.persona_id = first.persona_id AND a.world_id = c.world_id AND a.is_primary
   WHERE c.world_id = p_world_id
     AND c.timeline_date IS NOT NULL;
$function$;
