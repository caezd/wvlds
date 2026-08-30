-- ============================================================
-- Migration 134 — Deux déclencheurs jamais versionnés
-- ============================================================
-- Dernier volet de l'audit de dérive, après les tables (000), les fonctions
-- (130) et les policies (133). Comparaison des 28 déclencheurs de production
-- au rejeu de `.backup` + `migrations/*`, le 2026-08-29.
--
-- ── `trg_auth_user_soft_delete` — le plus gênant ─────────────
-- C'est lui qui appelle `handle_user_deletion` avant la suppression d'un
-- compte. La fonction est pourtant bien dans le dépôt : la migration 125 la
-- réécrit et détaille son rôle sur vingt lignes. Le déclencheur qui l'invoque,
-- lui, n'y a jamais figuré.
--
-- Trouvé par un contrôle simple, désormais automatisé : une fonction
-- `RETURNS trigger` qu'aucun `CREATE TRIGGER` ne câble. Sur les 28 fonctions
-- de déclencheur du dépôt, 27 sont câblées ; celle-ci était la seule orpheline.
--
-- Conséquence sur une base reconstruite : la suppression d'un compte ne
-- bloquait PAS — les clés étrangères sont en `ON DELETE SET NULL` — mais
-- `deleted_at` n'était jamais posé. Les personnages et les mondes de la
-- personne restaient donc vivants et sans propriétaire, au lieu d'être
-- marqués supprimés. Quelqu'un qui ferme son compte y laissait son contenu
-- publié.
--
--   personas.user_id  → auth.users(id)  ON DELETE SET NULL
--   worlds.owner_id   → auth.users(id)  ON DELETE SET NULL
--   profiles.id       → auth.users(id)  ON DELETE CASCADE
--
-- ── `chatroom_categories_updated_at` ─────────────────────────
-- La migration 070 crée la table avec sa colonne `updated_at` et sa valeur par
-- défaut, mais sans le déclencheur qui la rafraîchit. Sur une base
-- reconstruite, `updated_at` restait figé à la date de création.
--
-- ── Pourquoi aucun DROP ──────────────────────────────────────
-- Les deux déclencheurs existent déjà en production. Un `DROP` suivi d'un
-- `CREATE` sur `auth.users` ouvrirait une fenêtre — courte, mais réelle —
-- pendant laquelle une suppression de compte passerait sans soft-delete. Et si
-- le `CREATE` échouait, la fenêtre ne se refermerait pas. On ne crée donc que
-- si le déclencheur est absent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_auth_user_soft_delete' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_auth_user_soft_delete
      BEFORE DELETE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_user_deletion();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'chatroom_categories_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER chatroom_categories_updated_at
      BEFORE UPDATE ON public.chatroom_categories
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Effet sur la base actuelle : aucun, les deux existent déjà. Rejouée, cette
-- migration rend le même décompte —
--   SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;   -- inchangé
--
-- Et plus aucune fonction de déclencheur n'est orpheline dans le dépôt :
-- `lib/__tests__/triggerWiring.test.ts` le refuse désormais.
