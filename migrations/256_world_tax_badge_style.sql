-- 256 — Taxe : le badge se personnalise (couleur, icône).
--
-- `worlds.tax_badge_color` (hex, opacité admise) et `worlds.tax_badge_icon`
-- (nom d'icône Lucide) ; NULL : le style de l'application. La vue du badge
-- les rend, après ses colonnes d'origine (CREATE OR REPLACE VIEW n'ajoute
-- qu'en fin de liste).

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS tax_badge_color text,
  ADD COLUMN IF NOT EXISTS tax_badge_icon  text;

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_tax_badge_style;
ALTER TABLE public.worlds ADD CONSTRAINT worlds_tax_badge_style CHECK (
  (tax_badge_color IS NULL OR public.is_hex_color(tax_badge_color))
  AND (tax_badge_icon IS NULL OR char_length(tax_badge_icon) <= 64)
);

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
 WHERE w.tax_enabled AND w.enable_economy
   AND d.paid_at IS NULL AND d.waived_at IS NULL
   AND d.period_end <= now()
 GROUP BY d.persona_id, d.world_id, w.tax_badge_label, w.tax_badge_color, w.tax_badge_icon;

REVOKE ALL ON public.persona_tax_overdue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.persona_tax_overdue TO authenticated;
