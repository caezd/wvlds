-- 257 — Taxe : le badge des retardataires s'active à part.
--
-- Tous les mondes qui lèvent une taxe ne veulent pas marquer les personas en
-- retard : `worlds.tax_badge_enabled`, coupé par défaut. La vue du badge ne
-- rend plus personne tant qu'il est coupé ; les dettes, elles, restent.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS tax_badge_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.persona_tax_overdue
WITH (security_invoker = true) AS
SELECT d.persona_id,
       d.world_id,
       count(*)::integer AS periods,
       sum(d.amount)     AS total,
       w.tax_badge_label AS badge_label,
       w.tax_badge_color AS badge_color,
       w.tax_badge_icon  AS badge_icon
  FROM public.persona_tax_dues d
  JOIN public.worlds w ON w.id = d.world_id
 WHERE w.tax_enabled AND w.enable_economy AND w.tax_badge_enabled
   AND d.paid_at IS NULL AND d.waived_at IS NULL
   AND d.period_end <= now()
 GROUP BY d.persona_id, d.world_id, w.tax_badge_label, w.tax_badge_color, w.tax_badge_icon;

REVOKE ALL ON public.persona_tax_overdue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.persona_tax_overdue TO authenticated;
