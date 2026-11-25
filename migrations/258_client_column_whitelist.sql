-- ============================================================
-- Migration 258 — Liste blanche des colonnes écrites par le client
-- ============================================================
-- FAILLES CORRIGÉES (préexistantes, audit du 2026-11-25).
--
-- La RLS dit QUELLES LIGNES un compte peut modifier, jamais QUELLES COLONNES.
-- Le navigateur écrit directement dans ces tables ; quiconque peut modifier
-- une ligne pouvait y réécrire n'importe quelle colonne depuis la console :
--
--   worlds          un membre doté de `world.settings` réécrivait `owner_id`
--                   (prise de contrôle du monde) ou `deleted_at` (suppression
--                   réservée au propriétaire dans l'interface).
--   personas        le joueur cochait `is_template` sur son persona : sorti du
--                   quota (les modèles ne comptent pas, le trigger de quota ne
--                   joue qu'au changement de monde) et candidat au modèle de
--                   fiche du monde, copié dans les personas des autres.
--   chat_messages   l'auteur changeait `chat_id` : son message passait dans
--                   n'importe quel salon, d'un autre monde, privé, ou où il
--                   n'a pas le droit d'écrire ; ou `created_at`, `world_id`.
--   chatrooms       le créateur déplaçait le salon dans un autre monde
--                   (`world_id`) ou en changeait l'auteur (`created_by`).
--   dm_messages     l'auteur déplaçait un message vers une autre conversation,
--                   blocage compris.
--   persona_relations  la policy d'UPDATE ne revérifie pas `from_persona_id` :
--                   on rattachait une relation au persona d'un autre joueur.
--
-- Correctif, sur le modèle de la migration 089 (profiles) : plus d'UPDATE sur
-- toute la table pour anon/authenticated, puis un GRANT par colonne, limité à
-- ce que l'application écrit réellement (relevé dans le code client et dans
-- `save_persona_sheet`, seule fonction SECURITY INVOKER qui écrit dans ces
-- tables). Les fonctions SECURITY DEFINER et le service_role ne sont pas
-- concernés. Les triggers BEFORE qui modifient NEW non plus : le droit par
-- colonne porte sur la liste SET de la requête.
--
-- S'y ajoutent les règles qu'une liste de colonnes ne sait pas dire :
--   * seul le propriétaire supprime ou restaure son monde ;
--   * un persona n'entre dans un monde (création ou déplacement) que si
--     l'auteur de l'écriture en est membre ;
--   * un lieu, une catégorie, un type de relation ou les personas d'une
--     relation appartiennent au même monde que la ligne qui les désigne.
--
-- ⚠️ Toute colonne ajoutée plus tard à ces tables n'est PAS modifiable par le
-- client tant qu'un `GRANT UPDATE (colonne) … TO authenticated` ne l'ouvre
-- pas. Le contrôle lib/__tests__/columnUpdateWhitelist.test.ts l'exige.

-- ── worlds ──────────────────────────────────────────────────
REVOKE UPDATE ON public.worlds FROM anon, authenticated;
GRANT UPDATE (
  name, slug, description, visibility, is_archived, deleted_at,
  icon_url, banner_url, color,
  restrict_inventory, restrict_skills, timeline_enabled, timeline_config,
  enable_faceclaims, enable_inventory, enable_skills,
  allows_real_avatars, allows_illustrated_avatars, is_age_restricted,
  wiki_label, home_layout, announcement_html, announcement_size,
  home_body_color, home_panel_color, home_grid, home_show_stats, home_grid_gap,
  enable_map, enable_wiki, persona_review_enabled, require_faceclaim, persona_group_color,
  enable_live_chat, live_chat_retention, live_chat_colors, live_chat_bubbles,
  live_chat_personas, live_chat_actions, live_chat_join_mode, live_chat_idle_minutes,
  live_chat_offline_view,
  enable_economy, currency_units, inventory_mode, inventory_slots_default,
  inventory_slots_max, inventory_slot_cost, enable_shops, enable_trades, trades_same_account,
  enable_gains, gain_message, gain_scene_joined, gain_scene_created, gain_scene_completed,
  gain_daily_login, gain_message_cooldown, gain_daily_cap,
  tax_enabled, tax_amount, tax_every, tax_unit, tax_anchor, tax_mode, tax_accumulate,
  tax_grace_new, tax_badge_label, tax_badge_color, tax_badge_icon
) ON public.worlds TO authenticated;

-- La migration 257 ajoute `tax_badge_enabled` ; selon l'ordre d'application,
-- la colonne existe déjà ou pas encore.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'worlds' AND column_name = 'tax_badge_enabled'
  ) THEN
    GRANT UPDATE (tax_badge_enabled) ON public.worlds TO authenticated;
  END IF;
END;
$$;

-- ── personas ────────────────────────────────────────────────
-- `is_template`, `is_npc`, `user_id`, la validation de fiche et `deleted_at`
-- ne s'écrivent plus qu'à la création ou par les fonctions de la base.
REVOKE UPDATE ON public.personas FROM anon, authenticated;
GRANT UPDATE (
  name, bio, avatar_url, avatar_config, banner_url, avatar_frame_id,
  world_id, dialogue_color, faceclaim, marital_status, spouse_persona_id,
  map_pin_id, narrative_status
) ON public.personas TO authenticated;

-- ── chat_messages ───────────────────────────────────────────
-- Modifier un message, c'est modifier son texte et ses métadonnées.
REVOKE UPDATE ON public.chat_messages FROM anon, authenticated;
GRANT UPDATE (content, metadata) ON public.chat_messages TO authenticated;

-- ── chatrooms ───────────────────────────────────────────────
REVOKE UPDATE ON public.chatrooms FROM anon, authenticated;
GRANT UPDATE (
  title, name, tag, icon_url, banner_url, category_id, timeline_date,
  map_pin_id, arc_id, status, visibility, synopsis
) ON public.chatrooms TO authenticated;

-- ── dm_messages ─────────────────────────────────────────────
REVOKE UPDATE ON public.dm_messages FROM anon, authenticated;
GRANT UPDATE (content) ON public.dm_messages TO authenticated;

-- ── persona_relations ───────────────────────────────────────
-- Le statut passe par accept_persona_relation ; les deux personas et le monde
-- sont fixés à la création.
REVOKE UPDATE ON public.persona_relations FROM anon, authenticated;
GRANT UPDATE (type, description) ON public.persona_relations TO authenticated;


-- ============================================================
-- Règles complémentaires
-- ============================================================

-- Le monde d'une entité désignée par une clé étrangère. SECURITY DEFINER :
-- la RLS de l'écrivain ne doit pas faire passer pour « autre monde » une ligne
-- qu'il ne voit simplement pas (un lieu caché, par exemple). Ne rend qu'un
-- identifiant de monde, pour un identifiant que l'appelant connaît déjà.
CREATE OR REPLACE FUNCTION public.guard_world_of(p_kind text, p_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_kind
    WHEN 'map_pin'           THEN (SELECT w.world_id FROM public.world_map_pins w WHERE w.id = p_id)
    WHEN 'chatroom_category' THEN (SELECT c.world_id FROM public.chatroom_categories c WHERE c.id = p_id)
    WHEN 'persona'           THEN (SELECT p.world_id FROM public.personas p WHERE p.id = p_id AND p.deleted_at IS NULL)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_world_of(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_world_of(text, uuid) TO authenticated, service_role;

-- Le type d'une relation est un texte (identifiant de world_relation_types).
CREATE OR REPLACE FUNCTION public.guard_relation_type_world(p_type text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.world_id FROM public.world_relation_types t WHERE t.id::text = p_type;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_relation_type_world(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_relation_type_world(text) TO authenticated, service_role;


-- ── worlds : suppression réservée au propriétaire ───────────
-- SECURITY INVOKER : `current_user` désigne alors l'auteur de l'écriture, et
-- les fonctions de la base (SECURITY DEFINER) passent sans contrôle.
CREATE OR REPLACE FUNCTION public.tg_worlds_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND OLD.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Seul le propriétaire supprime ou restaure son monde.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worlds_owner_only ON public.worlds;
CREATE TRIGGER trg_worlds_owner_only
  BEFORE UPDATE OF deleted_at ON public.worlds
  FOR EACH ROW EXECUTE FUNCTION public.tg_worlds_owner_only();


-- ── personas : adhésion au monde, lieu du même monde ────────
CREATE OR REPLACE FUNCTION public.tg_personas_world_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_moved boolean := TG_OP = 'INSERT' OR NEW.world_id IS DISTINCT FROM OLD.world_id;
BEGIN
  IF v_moved AND NEW.world_id IS NOT NULL
     AND current_user IN ('authenticated', 'anon')
     AND NOT public.is_world_member(NEW.world_id, auth.uid()) THEN
    RAISE EXCEPTION 'Un persona n''entre que dans un monde dont vous êtes membre.' USING ERRCODE = '42501';
  END IF;

  IF NEW.map_pin_id IS NOT NULL
     AND public.guard_world_of('map_pin', NEW.map_pin_id) IS DISTINCT FROM NEW.world_id THEN
    -- Un persona qui change de monde quitte le lieu de l'ancien ; un lieu
    -- choisi explicitement doit appartenir à son monde.
    IF TG_OP = 'UPDATE' AND v_moved AND NEW.map_pin_id IS NOT DISTINCT FROM OLD.map_pin_id THEN
      NEW.map_pin_id := NULL;
    ELSE
      RAISE EXCEPTION 'Le lieu doit appartenir au monde du persona.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personas_world_links ON public.personas;
CREATE TRIGGER trg_personas_world_links
  BEFORE INSERT OR UPDATE OF world_id, map_pin_id ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.tg_personas_world_links();


-- ── chatrooms : catégorie et lieu du même monde ─────────────
CREATE OR REPLACE FUNCTION public.tg_chatrooms_world_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL
     AND public.guard_world_of('chatroom_category', NEW.category_id) IS DISTINCT FROM NEW.world_id THEN
    RAISE EXCEPTION 'La catégorie doit appartenir au monde du salon.' USING ERRCODE = '22023';
  END IF;
  IF NEW.map_pin_id IS NOT NULL
     AND public.guard_world_of('map_pin', NEW.map_pin_id) IS DISTINCT FROM NEW.world_id THEN
    RAISE EXCEPTION 'Le lieu doit appartenir au monde du salon.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chatrooms_world_links ON public.chatrooms;
CREATE TRIGGER trg_chatrooms_world_links
  BEFORE INSERT OR UPDATE OF category_id, map_pin_id ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatrooms_world_links();


-- ── persona_relations : type et personas du même monde ──────
CREATE OR REPLACE FUNCTION public.tg_persona_relations_world_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.guard_relation_type_world(NEW.type) IS DISTINCT FROM NEW.world_id THEN
    RAISE EXCEPTION 'Le type de relation doit appartenir au monde de la relation.' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' AND (
       public.guard_world_of('persona', NEW.from_persona_id) IS DISTINCT FROM NEW.world_id
    OR public.guard_world_of('persona', NEW.to_persona_id) IS DISTINCT FROM NEW.world_id
  ) THEN
    RAISE EXCEPTION 'Les deux personas doivent appartenir au monde de la relation.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_persona_relations_world_links ON public.persona_relations;
CREATE TRIGGER trg_persona_relations_world_links
  BEFORE INSERT OR UPDATE OF type ON public.persona_relations
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_relations_world_links();

-- ── ROLLBACK ─────────────────────────────────────────────────
-- GRANT UPDATE ON public.worlds, public.personas, public.chat_messages,
--   public.chatrooms, public.dm_messages, public.persona_relations TO authenticated;
-- DROP TRIGGER trg_worlds_owner_only ON public.worlds;
-- DROP TRIGGER trg_personas_world_links ON public.personas;
-- DROP TRIGGER trg_chatrooms_world_links ON public.chatrooms;
-- DROP TRIGGER trg_persona_relations_world_links ON public.persona_relations;
-- DROP FUNCTION public.tg_worlds_owner_only(), public.tg_personas_world_links(),
--   public.tg_chatrooms_world_links(), public.tg_persona_relations_world_links(),
--   public.guard_world_of(text, uuid), public.guard_relation_type_world(text);
