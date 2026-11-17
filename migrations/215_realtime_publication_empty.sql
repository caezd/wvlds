-- 215 — Plus aucune table dans la publication Realtime.
--
-- Depuis la migration 214 et le client qui l'écoute (lib/realtimeHub), tout le
-- temps réel passe par des avis diffusés par la base (`realtime.send`) sur des
-- canaux privés. Plus aucun écran ne s'abonne à `postgres_changes`
-- (vérifié : `realtime.subscription` vide une fois le client déployé).
--
-- Les tables restaient pourtant publiées, et Realtime relisait le journal de la
-- base environ deux fois par seconde même sans aucun abonné — 97 % du temps de
-- calcul de la base mesuré sur la période. On les retire toutes.
--
-- Pour revenir en arrière sur une table : ALTER PUBLICATION supabase_realtime
-- ADD TABLE public.<table>; — mais préférer un trigger de diffusion (cf. 212,
-- 214) à un nouvel abonnement `postgres_changes`.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', t.schemaname, t.tablename);
  END LOOP;
END
$$;
