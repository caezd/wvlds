-- ============================================================
-- Migration 125 — Suppression de `profiles.last_world_id`
-- ============================================================
-- Le « dernier monde visité » ne passe que par un cookie : `lib/supabase/
-- middleware.ts` l'écrit, `app/page.tsx` et `components/sidebar/SidebarRail.tsx`
-- le lisent. La colonne, elle, n'est lue ni écrite nulle part dans le code —
-- vérifié sur l'ensemble du dépôt, toutes les occurrences restantes du nom
-- désignent le cookie.
--
-- Relevé avant suppression :
--   type              uuid, nullable, sans valeur par défaut
--   lignes remplies   0 sur 8          ← aucune donnée perdue
--   index             aucun
--   policies RLS      aucune
--   vues              aucune
--   contrainte        profiles_last_world_id_fkey (supprimée avec la colonne)
--   fonctions         handle_user_deletion  ← traitée ci-dessous
--
-- La fonction est le seul point délicat. Elle met la colonne à NULL avant la
-- suppression d'un compte, pour que la clé étrangère `NO ACTION` ne bloque
-- pas. En plpgsql, une référence à une colonne disparue ne se voit qu'à
-- l'EXÉCUTION : sans ce premier temps, la suppression de compte se serait mise
-- à échouer, et seulement le jour où quelqu'un aurait supprimé son compte.
--
-- L'ordre compte donc : on réécrit la fonction, puis on supprime la colonne.

CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Soft-delete + libérer la FK en une seule opération
  -- La cascade SET NULL sur personas.user_id ne trouvera plus rien
  UPDATE public.personas
  SET deleted_at = COALESCE(deleted_at, now()),
      user_id    = NULL
  WHERE user_id = OLD.id;

  -- Idem pour worlds
  UPDATE public.worlds
  SET deleted_at = COALESCE(deleted_at, now()),
      owner_id   = NULL
  WHERE owner_id = OLD.id;

  -- (Le passage à NULL de profiles.last_world_id a disparu avec la colonne :
  --  le « dernier monde visité » ne vit plus que dans un cookie, il n'y a donc
  --  plus de clé étrangère à libérer ici.)

  RETURN OLD;
END;
$function$;

ALTER TABLE public.profiles DROP COLUMN last_world_id;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- La colonne a disparu :
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='profiles'
--      AND column_name='last_world_id';                      -- → 0
--
-- Plus aucune fonction ne la cite :
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.prokind='f'
--      AND pg_get_functiondef(p.oid) ILIKE '%last_world_id%'; -- → 0
--
-- Et la suppression de compte fonctionne toujours (le déclencheur
-- `handle_user_deletion` s'exécute sans erreur).

-- ── ROLLBACK ─────────────────────────────────────────────────
-- La colonne était vide : la restaurer ne perd rien, mais ne rend rien non
-- plus tant qu'aucun code ne l'écrit.
-- ALTER TABLE public.profiles
--   ADD COLUMN last_world_id uuid REFERENCES public.worlds(id);
-- (puis réintroduire le `UPDATE public.profiles SET last_world_id = NULL`
--  dans handle_user_deletion, avant le RETURN OLD)
