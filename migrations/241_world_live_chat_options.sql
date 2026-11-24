-- 241 — Chatbox : quatre options par monde (Paramètres › Fonctions › Chatbox).
--
-- 1. Réglages du monde, tous éteints par défaut :
--    - `live_chat_colors`   : chaque joueur choisit une couleur de dialogue ;
--    - `live_chat_bubbles`  : messages en bulles, les siens à droite ;
--    - `live_chat_personas` : un message peut être signé « joueur avec persona » ;
--    - `live_chat_actions`  : `/me …` écrit une action jouée, en italique,
--      précédée du nom du joueur (ou de son persona).
-- 2. Ce que porte un message : sa couleur (figée à l'envoi), son persona, et
--    s'il est une action.
-- 3. La base fait foi à l'envoi : une option éteinte efface la couleur ou
--    l'action demandée ; un persona n'est accepté que s'il est permis
--    (option allumée, persona du monde, non supprimé, jouable par l'auteur,
--    comme pour poster dans un salon).

-- ── 1. Réglages du monde ─────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS live_chat_colors   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_chat_bubbles  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_chat_personas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_chat_actions  boolean NOT NULL DEFAULT false;

-- ── 2. Ce que porte un message ───────────────────────────────
ALTER TABLE public.world_live_messages
  ADD COLUMN IF NOT EXISTS color      text,
  ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_action  boolean NOT NULL DEFAULT false;
ALTER TABLE public.world_live_messages DROP CONSTRAINT IF EXISTS world_live_messages_color_hex;
ALTER TABLE public.world_live_messages
  ADD CONSTRAINT world_live_messages_color_hex CHECK (color IS NULL OR public.is_hex_color(color));
CREATE INDEX IF NOT EXISTS world_live_messages_persona_idx
  ON public.world_live_messages (persona_id) WHERE persona_id IS NOT NULL;

-- ── 3. Contrôle à l'envoi ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_live_message_options()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_colors   boolean;
  v_personas boolean;
  v_actions  boolean;
BEGIN
  SELECT w.live_chat_colors, w.live_chat_personas, w.live_chat_actions
    INTO v_colors, v_personas, v_actions
    FROM public.worlds w WHERE w.id = NEW.world_id;

  -- Option éteinte (peut-être entre l'ouverture du panneau et l'envoi) : le
  -- message part quand même, sans ce qu'elle ajoutait.
  IF NOT coalesce(v_colors, false) THEN
    NEW.color := NULL;
  END IF;
  IF NOT coalesce(v_actions, false) THEN
    NEW.is_action := false;
  END IF;

  IF NEW.persona_id IS NOT NULL THEN
    IF NOT coalesce(v_personas, false) THEN
      RAISE EXCEPTION 'Les personas ne sont pas permis dans cette chatbox.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.personas p
       WHERE p.id = NEW.persona_id
         AND p.world_id = NEW.world_id
         AND p.deleted_at IS NULL
         AND NOT p.is_template
    )
    OR NOT public.owns_persona(NEW.persona_id, NEW.user_id)
    OR NOT public.is_persona_usable(NEW.persona_id, NEW.user_id) THEN
      RAISE EXCEPTION 'Ce persona ne peut pas écrire ici.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_message_options() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_live_message_options ON public.world_live_messages;
CREATE TRIGGER trg_world_live_message_options
  BEFORE INSERT ON public.world_live_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_live_message_options();
