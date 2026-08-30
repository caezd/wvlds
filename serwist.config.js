import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

// Sert de "cache-buster" pour le fallback /offline précaché explicitement
// ci-dessous (route rendue par le serveur, jamais exportée en fichier
// statique que le build pourrait découvrir tout seul).
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
// gitHead.stdout est "" (pas null/undefined) en cas d'échec — ?? seul ne
// détecte jamais ce cas et servirait éternellement la même révision vide.
const revision = gitHead.status === 0 && gitHead.stdout.trim() ? gitHead.stdout.trim() : crypto.randomUUID();

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  globIgnores: [
    // Bibliothèques d'assets volumineuses (constructeur d'avatar, sélecteur
    // d'icônes RPG) : chargées à la demande, pas au premier lancement. Mises
    // en cache paresseusement par la règle runtime "static-image-assets" de
    // defaultCache (StaleWhileRevalidate) au premier usage réel.
    "**/avatar_parts/**",
    "**/rpg_icons/**",
    // Même raisonnement : vignettes d'onglets du constructeur d'avatar
    // (153 Ko) et cadres cosmétiques (248 Ko), inutiles tant qu'on
    // n'ouvre pas le constructeur ou la boutique.
    "**/avatar_tabs/**",
    "**/frames/**",
    // Images d'aperçu social : elles ne sont demandées que par les robots des
    // réseaux sociaux, jamais par le navigateur d'un visiteur. Les précacher
    // faisait télécharger 566 Ko à chaque première visite, pour rien.
    "**/static/media/opengraph-image.*",
    "**/static/media/twitter-image.*",
    // Sources brutes de next/font/local (app/layout.tsx) : jamais servies
    // directement, next/font les recopie hashées sous _next/static/media.
    // Les précacher échouait avec un 307 (redirigées vers /auth/login par le
    // middleware, non authentifié, faute d'extension dans son exclusion).
    "**/fonts/opendyslexic/**",
  ],
});
