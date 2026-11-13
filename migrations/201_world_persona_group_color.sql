-- ============================================================
-- Migration 201 — La couleur de groupe devient une option du monde
-- ============================================================
-- Les groupes de personas ont une couleur. Elle teintait déjà, sans réglage,
-- le nom d'un persona dans les salons ; elle borde désormais aussi son avatar
-- (sans cadre) sur sa fiche. Un monde qui ne veut pas de ces teintes les
-- coupe ici : `worlds.persona_group_color`.
--
-- Activée par défaut : aucun monde existant ne change d'apparence.
-- La table est déjà ouverte en écriture aux gestionnaires du monde (grant de
-- table + RLS `has_world_permission`), la colonne en hérite.

ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS persona_group_color boolean NOT NULL DEFAULT true;

-- Vérification :
-- SELECT persona_group_color, count(*) FROM public.worlds GROUP BY 1;   -- → true : tous
--
-- Retour arrière :
-- ALTER TABLE public.worlds DROP COLUMN persona_group_color;
