-- ============================================================
-- Migration 135 — Index d'unicité des défis, jamais versionnés
-- ============================================================
-- Clôture de l'audit de dérive : tables (000), fonctions (130), policies (133),
-- déclencheurs (134), et enfin contraintes et index.
--
-- Méthode : comparer les 31 contraintes CHECK métier et les 77 index uniques de
-- la production aux noms présents dans le dépôt. Sur les 23 noms EXPLICITES
-- vérifiables ainsi, 4 semblaient manquer — mais trois sont des noms engendrés
-- par PostgreSQL pour des déclarations en ligne, bien présentes :
--
--   chat_message_reactions_message_id_user_id_emoji_key
--       ← UNIQUE (message_id, user_id, emoji), migration 001
--   persona_marital_requests_check
--       ← CHECK (requester_persona_id <> target_persona_id), migration 093
--
-- Le quatrième est un vrai écart.
--
-- ── L'écart ──────────────────────────────────────────────────
-- La migration 044 crée `idx_challenges_word_of_day_unique`. Cet index
-- n'existe plus en production, remplacé par deux autres qui n'ont jamais été
-- enregistrés :
--
--   idx_challenges_global_unique   un seul défi global par jour
--   idx_challenges_user_daily      un seul défi personnel par jour et par
--                                  personne
--
-- Ce sont des index UNIQUES : ils portent une règle métier, pas une
-- optimisation. Sur une base reconstruite, rien n'empêchait de créer plusieurs
-- défis du jour pour la même date.
--
-- La portée reste limitée — le drapeau `quests` est baissé, la fonctionnalité
-- n'est pas exposée. Mais l'écart se corrige au même prix aujourd'hui.
--
-- ── Effet sur la base actuelle : aucun ───────────────────────
-- Les deux index existent déjà. `IF NOT EXISTS` rend le fichier rejouable, et
-- le `DROP` ne vise que l'index remplacé, qui n'existe plus.

DROP INDEX IF EXISTS public.idx_challenges_word_of_day_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_global_unique
  ON public.challenges USING btree (active_date)
  WHERE ((world_id IS NULL) AND (user_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_user_daily
  ON public.challenges USING btree (active_date, user_id)
  WHERE ((world_id IS NULL) AND (user_id IS NOT NULL));

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT count(*) FROM pg_indexes
--    WHERE schemaname='public' AND tablename='challenges';   -- inchangé
--
-- ── Ce que cet audit N'A PAS couvert ─────────────────────────
-- Les contraintes et index engendrés par des déclarations EN LIGNE ne portent
-- pas de nom dans le dépôt : leur présence ne peut pas être vérifiée par
-- comparaison de noms. Une colonne ajoutée à la main sur une table existante
-- échappe de même à toute comparaison. Ces deux angles morts restent ouverts ;
-- seul un rejeu complet sur une base vierge les fermerait.
