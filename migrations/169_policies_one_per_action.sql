-- ============================================================
-- Migration 169 — Une politique évaluée par action, ailleurs aussi
-- ============================================================
-- La suite de la migration 168, hors de la carte. Deux gestes distincts :
--
-- ── 1. Effacer trois politiques qui font double emploi ───────
-- Trois tables portaient deux politiques au prédicat IDENTIQUE — le signe
-- d'une migration qui a posé la nouvelle sans retirer l'ancienne. Postgres
-- les évaluait toutes les deux, par ligne, pour en retenir le OU d'une valeur
-- avec elle-même.
--
-- ── 2. Scinder huit `FOR ALL` qui débordaient sur la lecture ─
-- Un `FOR ALL` couvre aussi SELECT et se doublait donc de la politique de
-- lecture. Chacune est ici scindée en une politique par action qui écrit.
--
-- CE QUI A ÉTÉ VÉRIFIÉ, TABLE PAR TABLE : que la condition d'écriture est
-- INCLUSE dans celle de lecture — sans quoi la scission retirerait un droit.
-- Sur quatre autres tables elle ne l'est pas, et elles restent en l'état :
--
--   persona_sections, persona_section_fields : l'écriture vaut pour le
--     propriétaire du persona, la lecture pour les seuls modèles du monde.
--     Scinder ferait perdre au propriétaire la vue de ses propres sections.
--   persona_group_assignments : l'écriture vaut aussi pour le propriétaire du
--     persona, dont rien ne garantit qu'il soit membre du monde.
--   challenges : l'écriture vaut pour un administrateur, que ni « member
--     read » ni « read own and global » ne couvrent.
--
-- `challenge_attempts` et `worlds` portent, eux, plusieurs politiques de
-- lecture qui disent des droits réellement différents : les réunir demande
-- une fusion, pas une scission. Laissées pour un autre jour.

-- chatroom_reads : identique, au caractère près, à « chatroom_reads: owner access » — même prédicat, même contrôle, et `{authenticated}` est inclus dans `{public}`.
DROP POLICY IF EXISTS "chatroom_reads owner" ON public.chatroom_reads;

-- gamification_balances : identique à « gamification_balances: owner read ».
DROP POLICY IF EXISTS "balances: read own" ON public.gamification_balances;

-- chatroom_persona_prefs : un `FOR ALL` entièrement recouvert par les quatre politiques par action (`select self`, `upsert self`, `update self`, `delete self`), toutes de même prédicat.
DROP POLICY IF EXISTS "chatroom_persona_prefs: owner access" ON public.chatroom_persona_prefs;

-- ── cosmetic_items ────────────────────────────────────
DROP POLICY IF EXISTS "cosmetic_items: admin write" ON public.cosmetic_items;
CREATE POLICY "cosmetic_items_insert" ON public.cosmetic_items FOR INSERT TO public WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
);
CREATE POLICY "cosmetic_items_update" ON public.cosmetic_items FOR UPDATE TO public USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
);
CREATE POLICY "cosmetic_items_delete" ON public.cosmetic_items FOR DELETE TO public USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
);

-- ── feature_flags ─────────────────────────────────────
DROP POLICY IF EXISTS "feature_flags: write by admin" ON public.feature_flags;
CREATE POLICY "feature_flags_insert" ON public.feature_flags FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
);
CREATE POLICY "feature_flags_update" ON public.feature_flags FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
);
CREATE POLICY "feature_flags_delete" ON public.feature_flags FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true)
);

-- ── user_canvas_positions ─────────────────────────────
DROP POLICY IF EXISTS "canvas_pos_write" ON public.user_canvas_positions;
CREATE POLICY "user_canvas_positions_insert" ON public.user_canvas_positions FOR INSERT TO public WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = user_canvas_positions.world_id
          AND (w.owner_id = (select auth.uid())
               OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid()))))
);
CREATE POLICY "user_canvas_positions_update" ON public.user_canvas_positions FOR UPDATE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = user_canvas_positions.world_id
          AND (w.owner_id = (select auth.uid())
               OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid()))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = user_canvas_positions.world_id
          AND (w.owner_id = (select auth.uid())
               OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid()))))
);
CREATE POLICY "user_canvas_positions_delete" ON public.user_canvas_positions FOR DELETE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = user_canvas_positions.world_id
          AND (w.owner_id = (select auth.uid())
               OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = w.id AND wm.user_id = (select auth.uid()))))
);

-- ── world_catalog_items ───────────────────────────────
DROP POLICY IF EXISTS "world_catalog_items_write" ON public.world_catalog_items;
CREATE POLICY "world_catalog_items_insert" ON public.world_catalog_items FOR INSERT TO public WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id
               AND m.user_id = (select auth.uid()) AND m.role IN ('admin','editor'))
);
CREATE POLICY "world_catalog_items_update" ON public.world_catalog_items FOR UPDATE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id
               AND m.user_id = (select auth.uid()) AND m.role IN ('admin','editor'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id
               AND m.user_id = (select auth.uid()) AND m.role IN ('admin','editor'))
);
CREATE POLICY "world_catalog_items_delete" ON public.world_catalog_items FOR DELETE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id
               AND m.user_id = (select auth.uid()) AND m.role IN ('admin','editor'))
);

-- ── world_relation_types ──────────────────────────────
DROP POLICY IF EXISTS "rel_types_owner_write" ON public.world_relation_types;
CREATE POLICY "world_relation_types_insert" ON public.world_relation_types FOR INSERT TO public WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_relation_types.world_id AND w.owner_id = (select auth.uid()))
);
CREATE POLICY "world_relation_types_update" ON public.world_relation_types FOR UPDATE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_relation_types.world_id AND w.owner_id = (select auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_relation_types.world_id AND w.owner_id = (select auth.uid()))
);
CREATE POLICY "world_relation_types_delete" ON public.world_relation_types FOR DELETE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_relation_types.world_id AND w.owner_id = (select auth.uid()))
);

-- ── user_equipped_cosmetics ───────────────────────────
DROP POLICY IF EXISTS "user_equipped_cosmetics: owner full" ON public.user_equipped_cosmetics;
CREATE POLICY "user_equipped_cosmetics_insert" ON public.user_equipped_cosmetics FOR INSERT TO public WITH CHECK (
  user_id = (select auth.uid())
);
CREATE POLICY "user_equipped_cosmetics_update" ON public.user_equipped_cosmetics FOR UPDATE TO public USING (
  user_id = (select auth.uid())
) WITH CHECK (
  user_id = (select auth.uid())
);
CREATE POLICY "user_equipped_cosmetics_delete" ON public.user_equipped_cosmetics FOR DELETE TO public USING (
  user_id = (select auth.uid())
);

-- ── world_persona_groups ──────────────────────────────
DROP POLICY IF EXISTS "owner_manage_groups" ON public.world_persona_groups;
CREATE POLICY "world_persona_groups_insert" ON public.world_persona_groups FOR INSERT TO public WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_persona_groups.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = world_persona_groups.world_id
               AND wm.user_id = (select auth.uid()) AND wm.role = 'admin')
);
CREATE POLICY "world_persona_groups_update" ON public.world_persona_groups FOR UPDATE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_persona_groups.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = world_persona_groups.world_id
               AND wm.user_id = (select auth.uid()) AND wm.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_persona_groups.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = world_persona_groups.world_id
               AND wm.user_id = (select auth.uid()) AND wm.role = 'admin')
);
CREATE POLICY "world_persona_groups_delete" ON public.world_persona_groups FOR DELETE TO public USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_persona_groups.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = world_persona_groups.world_id
               AND wm.user_id = (select auth.uid()) AND wm.role = 'admin')
);

-- ── world_members ─────────────────────────────────────
DROP POLICY IF EXISTS "members: managed by owner/admin" ON public.world_members;
CREATE POLICY "world_members_insert" ON public.world_members FOR INSERT TO authenticated WITH CHECK (
  public.is_world_admin(world_id, (select auth.uid()))
);
CREATE POLICY "world_members_update" ON public.world_members FOR UPDATE TO authenticated USING (
  public.is_world_admin(world_id, (select auth.uid()))
) WITH CHECK (
  public.is_world_admin(world_id, (select auth.uid()))
);
CREATE POLICY "world_members_delete" ON public.world_members FOR DELETE TO authenticated USING (
  public.is_world_admin(world_id, (select auth.uid()))
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   Les advisors : `multiple_permissive_policies` doit passer de 70 à ~30.
--   Et surtout, lire ET écrire sous RLS pour chaque table touchée.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Recréer chaque `_write` en `FOR ALL`, et les trois doublons effacés.
