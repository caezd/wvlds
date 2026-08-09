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
  // Bibliothèques d'assets volumineuses (constructeur d'avatar, sélecteur
  // d'icônes RPG) : chargées à la demande, pas au premier lancement. Mises en
  // cache paresseusement par la règle runtime "static-image-assets" de
  // defaultCache (StaleWhileRevalidate) au premier usage réel.
  globIgnores: ["**/avatar_parts/**", "**/rpg_icons/**"],
});
