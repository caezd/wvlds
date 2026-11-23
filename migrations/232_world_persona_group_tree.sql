-- ============================================================
-- Migration 232 — Sous-groupes de personas, couleur par groupe
-- ============================================================
-- Les groupes de personas d'un monde (`world_persona_groups`) étaient une
-- liste plate, et leur couleur s'allumait ou s'éteignait pour tout le monde à
-- la fois (`worlds.persona_group_color`, migration 201). Ils deviennent un
-- arbre, sans limite de profondeur, et chaque groupe décide de sa couleur.
--
-- ── 1. Colonnes ──────────────────────────────────────────────
--   parent_id    le groupe qui le contient ; NULL à la racine.
--   color        devient facultative : sans couleur propre, un groupe prend
--                celle de son plus proche ancêtre qui en a une.
--   apply_color  la couleur teinte-t-elle ses personas (nom dans les salons,
--                anneau de l'avatar, tuiles, graphe des relations) ? Reprend
--                l'interrupteur du monde : un monde qui avait coupé la
--                couleur voit tous ses groupes éteints.
--
-- `worlds.persona_group_color` n'est plus lue par le client de cette version
-- mais l'est encore par celle en production : on la supprimera après le
-- déploiement.
--
-- ── 2. Cohérence de l'arbre ──────────────────────────────────
-- Un parent est un groupe du même monde, jamais le groupe lui-même ni l'un de
-- ses descendants (trigger `tg_world_persona_groups_parent`). Un groupe ne
-- change pas de monde. Supprimer un groupe fait remonter ses sous-groupes
-- d'un niveau (trigger `tg_world_persona_groups_promote`) : ils gardent la
-- couleur qu'ils montraient. Quand c'est le monde qui disparaît, le trigger
-- s'efface et la cascade emporte tout.
--
-- ── 3. Appartenance héritée ──────────────────────────────────
-- Un persona d'un sous-groupe compte dans tous ses ancêtres : inviter un
-- groupe à un salon invite aussi ses sous-groupes. `persona_group_subtree`
-- rend un groupe et toute sa descendance ; les fonctions d'accès aux salons
-- privés et la notification des invités passent par elle.
--
-- ── 4. Teinte ────────────────────────────────────────────────
-- `persona_group_tint(group)` : la couleur que montre un persona de ce groupe,
-- ou NULL si le groupe ne l'applique pas. La chronologie
-- (`get_chatroom_personas`, `get_chatroom_openers`) s'en sert.
--
-- ── 5. Réordonner ────────────────────────────────────────────
-- `reorder_world_persona_groups(p_items)` sur le modèle de la migration 224 :
-- rang et parent en une requête, SECURITY INVOKER, renvoie le nombre de
-- lignes touchées.

-- ── 1. Colonnes ──────────────────────────────────────────────

ALTER TABLE public.world_persona_groups
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.world_persona_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apply_color boolean NOT NULL DEFAULT true;

ALTER TABLE public.world_persona_groups ALTER COLUMN color DROP NOT NULL;

ALTER TABLE public.world_persona_groups DROP CONSTRAINT IF EXISTS world_persona_groups_not_own_parent;
ALTER TABLE public.world_persona_groups
  ADD CONSTRAINT world_persona_groups_not_own_parent CHECK (parent_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS world_persona_groups_parent_idx ON public.world_persona_groups (parent_id);
CREATE INDEX IF NOT EXISTS world_persona_groups_world_idx ON public.world_persona_groups (world_id, sort_index);
-- Les accès aux salons privés joignent les affectations par groupe : sans
-- index, chaque vérification parcourait toute la table.
CREATE INDEX IF NOT EXISTS persona_group_assignments_group_idx ON public.persona_group_assignments (group_id);

UPDATE public.world_persona_groups g
   SET apply_color = false
  FROM public.worlds w
 WHERE w.id = g.world_id
   AND w.persona_group_color = false;

COMMENT ON COLUMN public.worlds.persona_group_color IS
  'Obsolète depuis la migration 232 (world_persona_groups.apply_color) ; à supprimer après déploiement.';

-- ── 3. Sous-arbre (déclaré avant les triggers qui s'en servent) ─

CREATE OR REPLACE FUNCTION public.persona_group_subtree(p_group uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  -- UNION et non UNION ALL : une boucle de parenté, que le trigger interdit,
  -- ne ferait pas tourner la récursion sans fin.
  WITH RECURSIVE tree(id) AS (
    SELECT p_group
    UNION
    SELECT g.id FROM public.world_persona_groups g JOIN tree t ON g.parent_id = t.id
  )
  SELECT id FROM tree WHERE id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.persona_group_subtree(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persona_group_subtree(uuid) TO authenticated;

-- ── 2. Cohérence de l'arbre ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_world_persona_groups_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.world_id IS DISTINCT FROM OLD.world_id THEN
    RAISE EXCEPTION 'Un groupe ne change pas de monde.' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.world_persona_groups g
     WHERE g.id = NEW.parent_id AND g.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'Ce groupe parent n''appartient pas au monde.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id
     AND EXISTS (SELECT 1 FROM public.persona_group_subtree(NEW.id) s(id) WHERE s.id = NEW.parent_id) THEN
    RAISE EXCEPTION 'Un groupe ne peut pas entrer dans l''un de ses sous-groupes.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_world_persona_groups_parent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS world_persona_groups_parent ON public.world_persona_groups;
CREATE TRIGGER world_persona_groups_parent
  BEFORE INSERT OR UPDATE OF parent_id, world_id ON public.world_persona_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_persona_groups_parent();

CREATE OR REPLACE FUNCTION public.tg_world_persona_groups_promote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Le monde supprimé, la cascade emporte tous ses groupes : rien à remonter.
  IF NOT EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = OLD.world_id) THEN
    RETURN OLD;
  END IF;
  -- Un sous-groupe qui héritait de la couleur du supprimé la garde.
  UPDATE public.world_persona_groups g
     SET parent_id = OLD.parent_id,
         color = COALESCE(g.color, OLD.color)
   WHERE g.parent_id = OLD.id;
  RETURN OLD;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_world_persona_groups_promote() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS world_persona_groups_promote ON public.world_persona_groups;
CREATE TRIGGER world_persona_groups_promote
  BEFORE DELETE ON public.world_persona_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_persona_groups_promote();

-- ── 4. Teinte ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.persona_group_tint(p_group uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  WITH RECURSIVE up(id, parent_id, color, depth) AS (
    SELECT g.id, g.parent_id, g.color, 0
      FROM public.world_persona_groups g
     WHERE g.id = p_group AND g.apply_color
    UNION ALL
    SELECT g.id, g.parent_id, g.color, up.depth + 1
      FROM public.world_persona_groups g
      JOIN up ON g.id = up.parent_id
     WHERE up.color IS NULL AND up.depth < 100
  )
  SELECT color FROM up WHERE color IS NOT NULL ORDER BY depth LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.persona_group_tint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persona_group_tint(uuid) TO authenticated;

-- ── 3. Appartenance héritée : accès et invitations ───────────

CREATE OR REPLACE FUNCTION public.can_post_in_chatroom(p_chat uuid, p_persona uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chatrooms c
     WHERE c.id = p_chat
       AND (
         c.visibility = 'open'
         OR c.created_by = p_uid
         OR public.has_world_permission(c.world_id, p_uid, 'chatrooms.manage')
         OR EXISTS (
           SELECT 1 FROM public.chatroom_participants cp
            WHERE cp.chatroom_id = c.id AND cp.persona_id = p_persona
         )
         OR EXISTS (
           SELECT 1
             FROM public.chatroom_participants cp
            CROSS JOIN LATERAL public.persona_group_subtree(cp.group_id) s(id)
             JOIN public.persona_group_assignments a ON a.group_id = s.id
            WHERE cp.chatroom_id = c.id AND cp.group_id IS NOT NULL AND a.persona_id = p_persona
         )
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_read_private_chatroom(p_chat uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chatrooms c
     WHERE c.id = p_chat
       AND (
         c.created_by = p_uid
         OR public.has_world_permission(c.world_id, p_uid, 'chatrooms.manage')
         OR EXISTS (
           SELECT 1
             FROM public.chatroom_participants cp
             JOIN public.personas p ON p.id = cp.persona_id
            WHERE cp.chatroom_id = c.id
              AND p.deleted_at IS NULL
              AND public.owns_persona(p.id, p_uid)
         )
         OR EXISTS (
           SELECT 1
             FROM public.chatroom_participants cp
            CROSS JOIN LATERAL public.persona_group_subtree(cp.group_id) s(id)
             JOIN public.persona_group_assignments a ON a.group_id = s.id
             JOIN public.personas p ON p.id = a.persona_id
            WHERE cp.chatroom_id = c.id
              AND cp.group_id IS NOT NULL
              AND p.deleted_at IS NULL
              AND public.owns_persona(p.id, p_uid)
         )
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.notify_chatroom_invitees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  salon public.chatrooms%ROWTYPE;
  v_actor_name text;
BEGIN
  SELECT * INTO salon FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
  IF NOT FOUND OR salon.visibility <> 'private' THEN RETURN NULL; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = salon.created_by;

  INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, actor_id, actor_name, content)
  SELECT DISTINCT p.user_id, 'new_chatroom', salon.world_id, salon.id,
         salon.created_by, v_actor_name, COALESCE(salon.title, salon.name)
    FROM public.personas p
   WHERE p.deleted_at IS NULL
     AND p.user_id IS NOT NULL
     AND p.user_id IS DISTINCT FROM salon.created_by
     AND (
       p.id = NEW.persona_id
       OR EXISTS (
         SELECT 1
           FROM public.persona_group_subtree(NEW.group_id) s(id)
           JOIN public.persona_group_assignments a ON a.group_id = s.id
          WHERE NEW.group_id IS NOT NULL AND a.persona_id = p.id
       )
     )
     AND public.is_world_member(salon.world_id, p.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = p.user_id AND np.type = 'new_chatroom' AND np.enabled = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = p.user_id AND n.chat_id = salon.id AND n.type = 'new_chatroom'
     );
  RETURN NULL;
END;
$function$;

-- ── 4. Teinte : la chronologie ───────────────────────────────

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
    LEFT JOIN public.persona_group_assignments ga ON ga.persona_id = a.persona_id AND ga.world_id = a.world_id
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
    LEFT JOIN public.persona_group_assignments a ON a.persona_id = first.persona_id AND a.world_id = c.world_id
   WHERE c.world_id = p_world_id
     AND c.timeline_date IS NOT NULL;
$function$;

-- ── 5. Réordonner ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reorder_world_persona_groups(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.world_persona_groups t
     SET parent_id = e.parent_id, sort_index = e.sort_index
    FROM jsonb_to_recordset(p_items) AS e(id uuid, parent_id uuid, sort_index integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_world_persona_groups(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_world_persona_groups(jsonb) TO authenticated;

-- Vérification :
-- SELECT apply_color, count(*) FROM public.world_persona_groups GROUP BY 1;
-- SELECT count(*) FROM public.world_persona_groups WHERE parent_id IS NOT NULL;   -- → 0
--
-- Retour arrière :
-- DROP FUNCTION public.reorder_world_persona_groups(jsonb);
-- (restaurer can_post_in_chatroom, can_read_private_chatroom,
--  notify_chatroom_invitees, get_chatroom_personas, get_chatroom_openers
--  depuis la migration 225 / 199 / 192)
-- DROP TRIGGER world_persona_groups_promote ON public.world_persona_groups;
-- DROP TRIGGER world_persona_groups_parent ON public.world_persona_groups;
-- DROP FUNCTION public.tg_world_persona_groups_promote(), public.tg_world_persona_groups_parent(),
--   public.persona_group_tint(uuid), public.persona_group_subtree(uuid);
-- UPDATE public.world_persona_groups SET color = '#6366f1' WHERE color IS NULL;
-- ALTER TABLE public.world_persona_groups ALTER COLUMN color SET NOT NULL,
--   DROP COLUMN apply_color, DROP COLUMN parent_id;
