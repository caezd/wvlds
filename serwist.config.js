import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

// Sert de "cache-buster" pour le fallback /offline précaché explicitement
// ci-dessous (route rendue par le serveur, jamais exportée en fichier
// statique que le build pourrait découvrir tout seul).
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ?? crypto.randomUUID();

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
    // Sources brutes de next/font/local (app/layout.tsx) : jamais servies
    // directement, next/font les recopie hashées sous _next/static/media.
    // Les précacher échouait avec un 307 (redirigées vers /auth/login par le
    // middleware, non authentifié, faute d'extension dans son exclusion).
    "**/fonts/opendyslexic/**",
  ],
});
