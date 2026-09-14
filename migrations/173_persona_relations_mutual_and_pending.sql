-- ============================================================
-- Migration 173 — Relations réciproques, à accepter ; le mariage en devient une
-- ============================================================
-- Deux mécaniques racontaient la même chose par deux chemins :
--
--   persona_relations         « A pense ceci de B » — écrit seul, sans que
--                             B soit consulté, à sens unique ;
--   persona_marital_requests  « A et B sont en couple » — demande, notif,
--                             acceptation, puis les deux fiches à jour.
--
-- Un type de relation porte désormais lui-même la règle : `mutual`. Un type
-- à sens unique (ennemi, méfiance, admiration) reste ce qu'il était — c'est
-- l'opinion d'un persona, personne d'autre n'a son mot à dire. Un type
-- réciproque (en couple, marié·e, frère/sœur, allié) engage les deux : la
-- relation naît `pending`, le joueur d'en face est notifié, et son acceptation
-- la rend `accepted` dans les DEUX sens. Le mariage n'est plus qu'un type
-- réciproque de plus, marqué `marital_status` : l'accepter écrit le statut et
-- le conjoint sur les deux fiches, comme `accept_marital_request` le faisait.
--
-- ── Ce que corrige aussi cette migration ─────────────────────
-- `persona_relations` n'avait AUCUNE politique UPDATE : changer le type ou la
-- description d'une relation depuis le canevas ne s'enregistrait jamais —
-- Supabase ne renvoie pas d'erreur sur zéro ligne, l'écran affichait la
-- réussite, tout disparaissait au rechargement. Et l'INSERT laissait un
-- joueur créer une relation AU DÉPART du persona de n'importe qui : seul le
-- client l'interdisait.
--
-- ── Ce qui reste, jusqu'au déploiement ───────────────────────
-- `persona_marital_requests`, sa RPC et son déclencheur ne sont pas touchés :
-- l'ancien code y écrit encore le temps que la mise en ligne passe (même
-- marche que la 161 → 172). Une migration suivante les retirera, après avoir
-- rejoué la reprise ci-dessous. Le type de notification `marital_request`
-- reste accepté pour la même raison.
--
-- État relevé le 2026-09-13 : 30 relations, 19 types dans 6 mondes sur 8,
-- 2 couples réciproques, 1 lien de conjoint à sens unique (d'avant la 093),
-- 0 demande maritale en attente.

-- ── 1. Les types : réciproque, et lien avec le statut marital ─

ALTER TABLE public.world_relation_types
  ADD COLUMN IF NOT EXISTS mutual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.world_relation_types
  ADD COLUMN IF NOT EXISTS marital_status TEXT;

-- Un type marital est forcément réciproque : on ne se marie pas seul.
ALTER TABLE public.world_relation_types
  ADD CONSTRAINT world_relation_types_marital_status_check
  CHECK (marital_status IS NULL OR (mutual AND marital_status IN ('in_relationship', 'married')));

-- Un seul type par statut marital et par monde : c'est celui que la fiche
-- choisit quand on désigne un·e conjoint·e.
CREATE UNIQUE INDEX IF NOT EXISTS world_relation_types_marital_unique
  ON public.world_relation_types (world_id, marital_status)
  WHERE marital_status IS NOT NULL;

-- ── 2. Les relations : un état ──────────────────────────────

ALTER TABLE public.persona_relations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';

ALTER TABLE public.persona_relations
  ADD CONSTRAINT persona_relations_status_check CHECK (status IN ('pending', 'accepted'));

CREATE INDEX IF NOT EXISTS persona_relations_to_persona_idx
  ON public.persona_relations (to_persona_id);

-- ── 3. Deux aides, pour des politiques lisibles ──────────────
-- `SECURITY DEFINER` : une politique sur persona_relations qui lit personas
-- et world_relation_types passerait sinon par LEURS politiques, et un
-- persona qu'on ne peut pas lire rendrait la relation impossible à écrire.

CREATE OR REPLACE FUNCTION public.owns_persona(pid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.personas p WHERE p.id = pid AND p.user_id = uid);
$$;

CREATE OR REPLACE FUNCTION public.relation_type_is_mutual(type_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((SELECT t.mutual FROM public.world_relation_types t WHERE t.id::text = type_id), FALSE);
$$;

REVOKE ALL ON FUNCTION public.owns_persona(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relation_type_is_mutual(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_persona(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relation_type_is_mutual(TEXT) TO authenticated;

-- ── 4. Politiques ────────────────────────────────────────────
-- Qui peut écrire : le joueur du persona DE DÉPART, ou le propriétaire ou un
-- admin du monde (comme les affectations de groupe). Une relation acceptée
-- d'un type réciproque vers le persona d'un AUTRE joueur ne peut pas naître
-- telle quelle : elle naît en attente, et c'est la RPC d'acceptation qui la
-- confirme — sinon la règle se contournerait d'un appel direct à PostgREST.

DROP POLICY IF EXISTS "players_create_relations" ON public.persona_relations;
CREATE POLICY "players_create_relations" ON public.persona_relations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND (
      public.owns_persona(from_persona_id, (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
    )
    -- En attente : seulement pour un type réciproque, il n'y a rien à accepter sinon.
    AND (status = 'accepted' OR public.relation_type_is_mutual(type))
    -- Acceptée d'emblée : seulement si rien n'attend l'accord d'un autre joueur.
    AND (
      status = 'pending'
      OR NOT public.relation_type_is_mutual(type)
      OR public.owns_persona(to_persona_id, (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
    )
  );

DROP POLICY IF EXISTS "players_update_relations" ON public.persona_relations;
CREATE POLICY "players_update_relations" ON public.persona_relations
  FOR UPDATE TO authenticated
  USING (
    public.owns_persona(from_persona_id, (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
  )
  WITH CHECK (
    (status = 'accepted' OR public.relation_type_is_mutual(type))
    AND (
      status = 'pending'
      OR NOT public.relation_type_is_mutual(type)
      OR public.owns_persona(to_persona_id, (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
    )
  );

-- Le joueur visé peut refuser ce qui l'attend, et rompre ce qui l'engage
-- (relation réciproque acceptée) — mais pas effacer ce qu'un autre persona
-- pense de lui à sens unique.
DROP POLICY IF EXISTS "players_delete_relations" ON public.persona_relations;
CREATE POLICY "players_delete_relations" ON public.persona_relations
  FOR DELETE TO authenticated
  USING (
    public.owns_persona(from_persona_id, (select auth.uid()))
    OR (
      public.owns_persona(to_persona_id, (select auth.uid()))
      AND (status = 'pending' OR public.relation_type_is_mutual(type))
    )
    OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
  );

-- ── 5. Accepter ──────────────────────────────────────────────
-- Ce qu'une relation réciproque acceptée entraîne — la ligne miroir, et les
-- deux fiches si le type est marital — est fait par un déclencheur, pas par
-- la RPC d'acceptation : une relation réciproque peut aussi naître acceptée
-- d'emblée (entre deux personas d'un même joueur, ou de la main d'un admin),
-- et elle doit produire exactement les mêmes effets. La RPC ne fait que ce
-- qu'aucune politique ne permet : passer à `accepted` au nom du persona visé.
--
-- Le miroir inséré ici redéclenche la fonction ; elle trouve alors l'original
-- déjà conforme et s'arrête — pas de récursion.

CREATE OR REPLACE FUNCTION public.on_persona_relation_accepted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_marital      TEXT;
  v_old_a_spouse UUID;
  v_old_b_spouse UUID;
BEGIN
  IF NEW.status <> 'accepted' OR NOT public.relation_type_is_mutual(NEW.type) THEN
    RETURN NEW;
  END IF;

  -- Le miroir : même type, sans description — celle-ci appartient à chaque
  -- côté. Une relation existante dans ce sens est alignée sur le type accepté.
  IF NOT EXISTS (
    SELECT 1 FROM public.persona_relations m
     WHERE m.world_id = NEW.world_id AND m.from_persona_id = NEW.to_persona_id
       AND m.to_persona_id = NEW.from_persona_id AND m.type = NEW.type AND m.status = 'accepted'
  ) THEN
    INSERT INTO public.persona_relations (world_id, from_persona_id, to_persona_id, type, status, created_by)
    VALUES (NEW.world_id, NEW.to_persona_id, NEW.from_persona_id, NEW.type, 'accepted', NEW.created_by)
    ON CONFLICT (world_id, from_persona_id, to_persona_id)
    DO UPDATE SET type = EXCLUDED.type, status = 'accepted';
  END IF;

  SELECT t.marital_status INTO v_marital
    FROM public.world_relation_types t WHERE t.id::text = NEW.type;
  IF v_marital IS NULL THEN RETURN NEW; END IF;

  -- Un persona qui avait déjà un·e conjoint·e différent·e le « perd » : on
  -- nettoie le pointeur réciproque de l'ancien·ne, sinon il resterait une
  -- relation fantôme à sens unique après le remariage (repris de
  -- accept_marital_request, migration 093).
  SELECT spouse_persona_id INTO v_old_a_spouse FROM public.personas WHERE id = NEW.from_persona_id;
  SELECT spouse_persona_id INTO v_old_b_spouse FROM public.personas WHERE id = NEW.to_persona_id;
  IF v_old_a_spouse IS NOT NULL AND v_old_a_spouse <> NEW.to_persona_id THEN
    UPDATE public.personas SET spouse_persona_id = NULL, marital_status = 'divorced'
     WHERE id = v_old_a_spouse AND spouse_persona_id = NEW.from_persona_id;
  END IF;
  IF v_old_b_spouse IS NOT NULL AND v_old_b_spouse <> NEW.from_persona_id THEN
    UPDATE public.personas SET spouse_persona_id = NULL, marital_status = 'divorced'
     WHERE id = v_old_b_spouse AND spouse_persona_id = NEW.to_persona_id;
  END IF;

  UPDATE public.personas SET marital_status = v_marital, spouse_persona_id = NEW.to_persona_id
   WHERE id = NEW.from_persona_id AND (marital_status IS DISTINCT FROM v_marital OR spouse_persona_id IS DISTINCT FROM NEW.to_persona_id);
  UPDATE public.personas SET marital_status = v_marital, spouse_persona_id = NEW.from_persona_id
   WHERE id = NEW.to_persona_id AND (marital_status IS DISTINCT FROM v_marital OR spouse_persona_id IS DISTINCT FROM NEW.from_persona_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_persona_relation_accepted ON public.persona_relations;
CREATE TRIGGER trg_on_persona_relation_accepted
  AFTER INSERT OR UPDATE OF status, type ON public.persona_relations
  FOR EACH ROW EXECUTE FUNCTION public.on_persona_relation_accepted();

CREATE OR REPLACE FUNCTION public.accept_persona_relation(p_relation_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_to UUID;
BEGIN
  SELECT to_persona_id INTO v_to FROM public.persona_relations
   WHERE id = p_relation_id AND status = 'pending';
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Demande introuvable ou déjà traitée.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.owns_persona(v_to, auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas répondre à cette demande.' USING ERRCODE = 'P0001';
  END IF;
  -- Le déclencheur ci-dessus fait le reste : miroir, fiches.
  UPDATE public.persona_relations SET status = 'accepted' WHERE id = p_relation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_persona_relation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_persona_relation(UUID) TO authenticated;

-- ── 6. Rompre ────────────────────────────────────────────────
-- Supprimer un côté d'une relation réciproque acceptée supprime l'autre : une
-- relation qui engage les deux ne peut pas rester à moitié. Si le type est
-- marital, les deux fiches retrouvent leur liberté — `divorced` après un
-- mariage, `single` après une relation. Le miroir supprimé ici redéclenche la
-- fonction, qui ne trouve plus rien à faire : pas de récursion.

CREATE OR REPLACE FUNCTION public.on_persona_relation_deleted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_marital TEXT;
BEGIN
  IF OLD.status <> 'accepted' OR NOT public.relation_type_is_mutual(OLD.type) THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.persona_relations
   WHERE world_id = OLD.world_id
     AND from_persona_id = OLD.to_persona_id
     AND to_persona_id = OLD.from_persona_id
     AND type = OLD.type;

  SELECT t.marital_status INTO v_marital
    FROM public.world_relation_types t WHERE t.id::text = OLD.type;
  IF v_marital IS NOT NULL THEN
    UPDATE public.personas
       SET spouse_persona_id = NULL,
           marital_status = CASE WHEN v_marital = 'married' THEN 'divorced' ELSE 'single' END
     WHERE (id = OLD.from_persona_id AND spouse_persona_id = OLD.to_persona_id)
        OR (id = OLD.to_persona_id AND spouse_persona_id = OLD.from_persona_id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_persona_relation_deleted ON public.persona_relations;
CREATE TRIGGER trg_on_persona_relation_deleted
  AFTER DELETE ON public.persona_relations
  FOR EACH ROW EXECUTE FUNCTION public.on_persona_relation_deleted();

-- ── 7. Notifier ──────────────────────────────────────────────
-- Un nouveau type, `relation_request` ; `marital_request` reste accepté le
-- temps du déploiement (voir l'en-tête).

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply',
    'marital_request', 'relation_request'
  ));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply', 'marital_request', 'relation_request'
  ));

-- Le filtre notification_preferences est appliqué par le déclencheur
-- universel before_notification_insert (migrations 032/035).
CREATE OR REPLACE FUNCTION public.notify_on_relation_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target_user      UUID;
  v_target_name      TEXT;
  v_requester_user   UUID;
  v_requester_name   TEXT;
  v_requester_avatar TEXT;
  v_type_name        TEXT;
  v_marital          TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT user_id, name INTO v_target_user, v_target_name
    FROM public.personas WHERE id = NEW.to_persona_id;
  IF v_target_user IS NULL THEN RETURN NEW; END IF;

  SELECT user_id, name, avatar_url INTO v_requester_user, v_requester_name, v_requester_avatar
    FROM public.personas WHERE id = NEW.from_persona_id;
  SELECT name, marital_status INTO v_type_name, v_marital
    FROM public.world_relation_types WHERE id::text = NEW.type;

  INSERT INTO public.notifications
    (recipient_id, type, world_id, actor_id, actor_name, persona_id, content, metadata)
  VALUES
    (v_target_user, 'relation_request', NEW.world_id, v_requester_user, v_requester_name, NEW.from_persona_id, v_target_name,
     jsonb_build_object(
       'icon_url', v_requester_avatar,
       'relation_id', NEW.id,
       'type_name', v_type_name,
       'marital_status', v_marital,
       'target_persona_id', NEW.to_persona_id
     ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_relation_request ON public.persona_relations;
CREATE TRIGGER trg_notify_on_relation_request
  AFTER INSERT ON public.persona_relations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_relation_request();

-- ── 8. Reprise des données ───────────────────────────────────
-- Chaque monde reçoit ses deux types maritaux (rejouable : l'index unique
-- les protège). Puis les couples existants deviennent des relations
-- acceptées dans les deux sens, et les demandes en attente des relations en
-- attente. Un conjoint à sens unique — écrit avant la 093, jamais confirmé —
-- devient une demande : le joueur d'en face est enfin consulté.

INSERT INTO public.world_relation_types (world_id, name, color, dash, sort_index, mutual, marital_status)
SELECT w.id, 'En couple', '#ec4899', '', COALESCE((SELECT max(sort_index) FROM public.world_relation_types t WHERE t.world_id = w.id), -1) + 1, TRUE, 'in_relationship'
  FROM public.worlds w
 WHERE NOT EXISTS (SELECT 1 FROM public.world_relation_types t WHERE t.world_id = w.id AND t.marital_status = 'in_relationship');

INSERT INTO public.world_relation_types (world_id, name, color, dash, sort_index, mutual, marital_status)
SELECT w.id, 'Marié·e', '#e11d48', '', COALESCE((SELECT max(sort_index) FROM public.world_relation_types t WHERE t.world_id = w.id), -1) + 1, TRUE, 'married'
  FROM public.worlds w
 WHERE NOT EXISTS (SELECT 1 FROM public.world_relation_types t WHERE t.world_id = w.id AND t.marital_status = 'married');

-- Couples réciproques → acceptées. Une ligne suffit : le déclencheur
-- d'acceptation pose le miroir, et les fiches sont déjà à jour.
INSERT INTO public.persona_relations (world_id, from_persona_id, to_persona_id, type, status, created_by)
SELECT a.world_id, a.id, b.id, t.id::text, 'accepted', a.user_id
  FROM public.personas a
  JOIN public.personas b ON b.id = a.spouse_persona_id AND b.spouse_persona_id = a.id AND b.world_id = a.world_id
  JOIN public.world_relation_types t ON t.world_id = a.world_id AND t.marital_status = a.marital_status
 WHERE a.marital_status IN ('in_relationship', 'married')
ON CONFLICT (world_id, from_persona_id, to_persona_id)
DO UPDATE SET type = EXCLUDED.type, status = 'accepted';

-- Conjoint à sens unique → demande (notifie, par le déclencheur ci-dessus).
INSERT INTO public.persona_relations (world_id, from_persona_id, to_persona_id, type, status, created_by)
SELECT a.world_id, a.id, b.id, t.id::text, 'pending', a.user_id
  FROM public.personas a
  JOIN public.personas b ON b.id = a.spouse_persona_id AND b.spouse_persona_id IS DISTINCT FROM a.id AND b.world_id = a.world_id
  JOIN public.world_relation_types t ON t.world_id = a.world_id AND t.marital_status = a.marital_status
 WHERE a.marital_status IN ('in_relationship', 'married')
ON CONFLICT (world_id, from_persona_id, to_persona_id) DO NOTHING;

-- Demandes maritales en attente → relations en attente.
INSERT INTO public.persona_relations (world_id, from_persona_id, to_persona_id, type, status, created_by)
SELECT a.world_id, r.requester_persona_id, r.target_persona_id, t.id::text, 'pending', a.user_id
  FROM public.persona_marital_requests r
  JOIN public.personas a ON a.id = r.requester_persona_id
  JOIN public.world_relation_types t ON t.world_id = a.world_id AND t.marital_status = r.requested_status
 WHERE r.status = 'pending'
ON CONFLICT (world_id, from_persona_id, to_persona_id) DO NOTHING;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'persona_relations';
--   -- attendu : members_read_relations, players_create_relations,
--   --           players_update_relations, players_delete_relations
-- SELECT count(*) FROM public.world_relation_types WHERE marital_status IS NOT NULL;
--   -- attendu : 2 × nombre de mondes
-- SELECT status, count(*) FROM public.persona_relations GROUP BY status;
--   -- attendu : +4 acceptées (2 couples × 2 sens) et +1 en attente

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_notify_on_relation_request ON public.persona_relations;
-- DROP FUNCTION IF EXISTS public.notify_on_relation_request();
-- DROP TRIGGER IF EXISTS trg_on_persona_relation_deleted ON public.persona_relations;
-- DROP FUNCTION IF EXISTS public.on_persona_relation_deleted();
-- DROP TRIGGER IF EXISTS trg_on_persona_relation_accepted ON public.persona_relations;
-- DROP FUNCTION IF EXISTS public.on_persona_relation_accepted();
-- DROP FUNCTION IF EXISTS public.accept_persona_relation(UUID);
-- DELETE FROM public.persona_relations WHERE type IN (SELECT id::text FROM public.world_relation_types WHERE marital_status IS NOT NULL);
-- DELETE FROM public.world_relation_types WHERE marital_status IS NOT NULL;
-- (recréer les politiques de la migration 000 pour INSERT et DELETE ; UPDATE n'en avait pas)
-- ALTER TABLE public.persona_relations DROP CONSTRAINT IF EXISTS persona_relations_status_check;
-- ALTER TABLE public.persona_relations DROP COLUMN IF EXISTS status;
-- DROP INDEX IF EXISTS public.world_relation_types_marital_unique;
-- ALTER TABLE public.world_relation_types DROP CONSTRAINT IF EXISTS world_relation_types_marital_status_check;
-- ALTER TABLE public.world_relation_types DROP COLUMN IF EXISTS marital_status, DROP COLUMN IF EXISTS mutual;
-- DROP FUNCTION IF EXISTS public.relation_type_is_mutual(TEXT);
-- DROP FUNCTION IF EXISTS public.owns_persona(UUID, UUID);
