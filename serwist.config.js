import { spawnSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import { serwist } from "@serwist/next/config";

// Sert de "cache-buster" pour le fallback /offline précaché explicitement
// ci-dessous (route rendue par le serveur, jamais exportée en fichier
// statique que le build pourrait découvrir tout seul).
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
// gitHead.stdout est "" (pas null/undefined) en cas d'échec — ?? seul ne
// détecte jamais ce cas et servirait éternellement la même révision vide.
const revision = gitHead.status === 0 && gitHead.stdout.trim() ? gitHead.stdout.trim() : crypto.randomUUID();

// ── Précache restreint au fallback hors ligne ───────────────────────────
// Par défaut, Serwist précache TOUS les morceaux JS/CSS du build (~7 Mo,
// 150+ fichiers), retéléchargés par chaque visiteur à chaque déploiement.
// Or hors ligne, une navigation ne peut afficher que /offline : les pages
// sont rendues par le serveur et ne sont pas précachées. Les morceaux des
// autres pages ne servent donc à rien hors ligne ; en ligne, la règle
// runtime de defaultCache (CacheFirst) les met en cache à la première visite.
//
// On ne garde que ce que /offline charge : morceaux racine du runtime, ceux
// du layout racine et de la page, ses CSS — plus, par sécurité, tout morceau
// que ces fichiers chargent à la demande. Les autres entrées (icônes,
// manifestes, /offline) sont inchangées. En cas de doute (manifeste absent,
// format inattendu), on garde le précache complet : jamais moins sûr qu'avant.
const DIST = ".next/";
const CHUNKS = `${DIST}static/chunks/`;

function fichiersHorsLigne() {
  const build = JSON.parse(fs.readFileSync(`${DIST}build-manifest.json`, "utf-8"));
  const source = fs.readFileSync(`${DIST}server/app/offline/page_client-reference-manifest.js`, "utf-8");
  const bac = { self: {} };
  bac.globalThis = bac.self;
  vm.runInNewContext(source, bac);
  const rsc = bac.self.__RSC_MANIFEST?.["/offline/page"];
  if (!rsc?.entryJSFiles?.["[project]/app/offline/page"]?.length) throw new Error("manifeste de /offline inattendu");

  const garder = new Set([...build.rootMainFiles, ...build.polyfillFiles, ...build.lowPriorityFiles]);
  for (const liste of Object.values(rsc.entryJSFiles)) for (const f of liste) garder.add(f);
  for (const liste of Object.values(rsc.entryCSSFiles)) for (const f of liste) garder.add(f.path);
  for (const mod of Object.values(rsc.clientModules ?? {}))
    for (const c of mod.chunks ?? []) garder.add(c.replace(/^\/_next\//, ""));

  // Morceaux chargés à la demande depuis ceux-ci (import dynamique).
  const file = [...garder];
  while (file.length) {
    const f = file.pop();
    if (!f.endsWith(".js") || !fs.existsSync(DIST + f)) continue;
    for (const [ref] of fs.readFileSync(DIST + f, "utf-8").matchAll(/static\/chunks\/[\w.-]+?\.(?:js|css)/g)) {
      if (!garder.has(ref)) {
        garder.add(ref);
        file.push(ref);
      }
    }
  }
  return new Set([...garder].map((f) => DIST + f));
}

function precacheHorsLigne(entrees) {
  let garder;
  try {
    garder = fichiersHorsLigne();
  } catch (e) {
    return {
      manifest: entrees,
      warnings: [`Précache complet conservé : ${e.message}`],
    };
  }
  const manifest = entrees.filter((e) => !e.url.startsWith(CHUNKS) || garder.has(e.url));
  const gardes = manifest.filter((e) => e.url.startsWith(CHUNKS)).length;
  // Garde-fou : la page hors ligne a toujours au moins son JS et son CSS.
  if (gardes < 3)
    return {
      manifest: entrees,
      warnings: ["Précache complet conservé : trop peu de morceaux trouvés"],
    };
  return { manifest, warnings: [] };
}

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  manifestTransforms: [precacheHorsLigne],
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
