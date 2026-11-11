-- 208 — Avis d'adhésion et de retrait d'un monde, sur le canal personnel.
--
-- Deux défauts réglés ensemble :
--
-- 1. Un membre retiré d'un monde restait abonné au canal privé de ce monde
--    (`world-msgs:<monde>`, migration 206) jusqu'à sa reconnexion : son
--    autorisation n'est vérifiée qu'à l'abonnement. Il recevait encore les
--    avis de nouveaux messages (ids, pas de contenu).
-- 2. `WorldMembershipGuard` écoutait TOUTES les suppressions de
--    `world_members` (`postgres_changes` sans filtre, les DELETE ne passant pas
--    par la policy de lecture) : chaque utilisateur connecté apprenait chaque
--    retrait de membre, de tous les mondes.
--
-- Désormais un trigger envoie l'avis au SEUL intéressé, sur son canal privé
-- `msgs:<user_id>` (déjà autorisé par la policy de la migration 206) :
--   - `membership` / { world_id, change: 'removed' } : le client ferme le canal
--     du monde, efface ses non-lus, et le garde le renvoie hors du monde ;
--   - `membership` / { world_id, change: 'added' } : le client ouvre le canal
--     du nouveau monde — ses non-lus arrivent en direct sans recharger.
--
-- Limite : un client modifié pourrait ignorer l'avis et rester abonné ; son
-- autorisation est réévaluée au plus tard à sa reconnexion. Il n'en tirerait
-- que des ids, jamais de contenu.

CREATE OR REPLACE FUNCTION public.broadcast_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM realtime.send(
      jsonb_build_object('world_id', NEW.world_id, 'change', 'added'),
      'membership', 'msgs:' || NEW.user_id::text, true);
    RETURN NULL;
  END IF;
  PERFORM realtime.send(
    jsonb_build_object('world_id', OLD.world_id, 'change', 'removed'),
    'membership', 'msgs:' || OLD.user_id::text, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Un avis temps réel ne doit jamais faire échouer l'adhésion ou le retrait.
  RAISE WARNING 'broadcast_membership_change : %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broadcast_membership_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_broadcast_membership_change ON public.world_members;
CREATE TRIGGER trg_broadcast_membership_change
  AFTER INSERT OR DELETE ON public.world_members
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_membership_change();

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_broadcast_membership_change ON public.world_members;
-- DROP FUNCTION IF EXISTS public.broadcast_membership_change();
