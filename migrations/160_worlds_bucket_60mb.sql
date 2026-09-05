-- ============================================================
-- Migration 160 — Le bucket `worlds` accepte jusqu'à 60 Mo
-- ============================================================
-- Une carte de monde est le seul dessin qu'on regarde à la loupe : elle vient
-- souvent d'un export en pleine résolution, et 20 Mo — la limite que le client
-- posait — les refusait.
--
-- Le client passe à 60 Mo (`MAX_MAP_IMAGE_MB`, lib/constants.ts). Le bucket
-- doit suivre à l'IDENTIQUE, pour deux raisons :
--
--   1. Il était à 10 Mo, soit MOINS que ce que le client acceptait déjà. Une
--      image entre les deux passait le contrôle de l'interface et se faisait
--      refuser par le stockage — un « Téléversement impossible » que rien
--      n'expliquait à l'écran.
--   2. `toWebP` ramène bien les images à 4096 px, mais il EXEMPTE les GIF, les
--      SVG et les WebP, qui partent tels quels. Une carte déjà exportée en
--      WebP arrive donc au stockage à sa taille d'origine.
--
-- Ce bucket sert aussi aux icônes et bannières d'un monde, et aux bannières
-- d'un lieu : leurs propres limites, côté client, restent inchangées (5 Mo
-- pour une bannière de lieu). Une limite de bucket est un garde-fou, pas une
-- règle de gestion.

UPDATE storage.buckets
   SET file_size_limit = 60 * 1024 * 1024
 WHERE id = 'worlds';

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT id, pg_size_pretty(file_size_limit) FROM storage.buckets
--    WHERE id = 'worlds';
--   -- attendu : 60 MB

-- ── ROLLBACK ─────────────────────────────────────────────────
-- UPDATE storage.buckets SET file_size_limit = 10 * 1024 * 1024 WHERE id = 'worlds';
