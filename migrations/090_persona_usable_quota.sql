-- ============================================================
-- Migration 090 — Restriction d'usage : seuls les 5 premiers personas
-- (par ordre chronologique de création) restent jouables en plan gratuit
-- ============================================================
-- Contexte : has_persona_capacity() bloque déjà la CRÉATION au-delà de 5
-- personas par monde en plan gratuit, mais un joueur qui dépasse ce quota
-- (ex. abonné puis résilié) pouvait continuer à JOUER indéfiniment tous ses
-- personas existants dans les chatrooms — aucune vérification à l'usage.
--
-- Règle : en plan gratuit, seuls les 5 personas les PLUS ANCIENS (created_at)
-- par monde restent utilisables pour poster un message. Les personas au-delà
-- restent visibles, éditables, jouables ailleurs (fiche, etc.) — seule la
-- capacité à les SÉLECTIONNER POUR POSTER est restreinte. Aucune suppression
-- ni verrouillage rétroactif du contenu déjà posté.
-- Abonné/lifetime : aucune restriction (comme has_persona_capacity).

-- ── is_persona_usable ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_persona_usable(p_persona_id UUID, p_uid UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_user_subscribed(p_uid)
    OR EXISTS (
      SELECT 1 FROM (
        SELECT id FROM public.personas
        WHERE user_id = p_uid
          AND world_id = (
            SELECT world_id FROM public.personas
            WHERE id = p_persona_id AND user_id = p_uid
          )
          AND NOT is_template
        ORDER BY created_at ASC, id ASC
        LIMIT 5
      ) eligible
      WHERE eligible.id = p_persona_id
    );
$$;

-- ── chat_messages : INSERT — un persona non éligible ne peut plus poster ──
DROP POLICY IF EXISTS "messages insert (player+ & persona owned)" ON public.chat_messages;
CREATE POLICY "messages insert (player+ & persona owned)"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1
        FROM chatrooms c
        JOIN world_members wm ON wm.world_id = c.world_id
        WHERE c.id = chat_messages.chat_id
          AND wm.user_id = (SELECT auth.uid())
          AND wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role, 'editor'::world_role, 'player'::world_role])
      )
    )
    AND owns_persona(persona_id, (SELECT auth.uid()))
    AND public.is_persona_usable(persona_id, (SELECT auth.uid()))
  );

-- ── chat_messages : UPDATE de persona_id — même contrôle qu'à la création ──
-- messages_update_own (author_id = auth.uid()) ne revalide ni la propriété ni
-- l'éligibilité du persona : ré-assigner un message existant à un AUTRE
-- persona (non possédé, ou au-delà du quota) contournerait sinon la règle
-- ci-dessus. Un trigger (et non la policy RLS) permet de ne re-vérifier que
-- lorsque persona_id change réellement — une simple correction de texte sur
-- un message déjà posté avec un persona depuis devenu inéligible reste donc
-- possible (aucune pénalité rétroactive sur le contenu déjà publié).
CREATE OR REPLACE FUNCTION public.enforce_persona_usable_on_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.persona_id IS NOT DISTINCT FROM OLD.persona_id THEN
    RETURN NEW;
  END IF;
  IF NEW.persona_id IS NOT NULL THEN
    IF NOT public.owns_persona(NEW.persona_id, NEW.author_id) THEN
      RAISE EXCEPTION 'Persona non possédé.';
    END IF;
    IF NOT public.is_persona_usable(NEW.persona_id, NEW.author_id) THEN
      RAISE EXCEPTION 'Ce persona a dépassé la limite du plan gratuit et ne peut plus être utilisé.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_persona_usable_on_message_update ON public.chat_messages;
CREATE TRIGGER trg_enforce_persona_usable_on_message_update
  BEFORE UPDATE OF persona_id ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_persona_usable_on_message_update();

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_enforce_persona_usable_on_message_update ON public.chat_messages;
-- DROP FUNCTION IF EXISTS public.enforce_persona_usable_on_message_update();
-- DROP POLICY IF EXISTS "messages insert (player+ & persona owned)" ON public.chat_messages;
-- CREATE POLICY "messages insert (player+ & persona owned)"
--   ON public.chat_messages FOR INSERT
--   WITH CHECK (
--     (
--       EXISTS (
--         SELECT 1 FROM chatrooms c JOIN world_members wm ON wm.world_id = c.world_id
--         WHERE c.id = chat_messages.chat_id AND wm.user_id = (SELECT auth.uid())
--           AND wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role, 'editor'::world_role, 'player'::world_role])
--       )
--     ) AND owns_persona(persona_id, (SELECT auth.uid()))
--   );
-- DROP FUNCTION IF EXISTS public.is_persona_usable(UUID, UUID);
