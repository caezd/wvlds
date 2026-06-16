// Génère lib/lucideCategories.ts : la table catégorie → icônes de Lucide,
// dans le même ordre que https://lucide.dev/icons/categories.
//
// Source des métadonnées : archive du dépôt lucide-icons/lucide (branche main),
// extraite au préalable dans scripts/.lucide-meta/ (voir le script shell appelant).
// On n'inclut que les icônes réellement présentes dans la version installée de
// lucide-react (clés de dynamicIconImports), pour ne jamais référencer une icône
// inexistante au runtime.

// Régénération (depuis la racine du projet, shell avec curl + tar) :
//
//   curl -sL https://codeload.github.com/lucide-icons/lucide/tar.gz/refs/heads/main -o scripts/.lucide.tar.gz
//   mkdir -p scripts/.lucide-meta
//   tar -xzf scripts/.lucide.tar.gz -C scripts/.lucide-meta
//   node scripts/gen-lucide-categories.mjs
//   rm -rf scripts/.lucide-meta scripts/.lucide.tar.gz
//
// Le script lit scripts/.lucide-meta/lucide-*/{icons,categories}/*.json puis
// écrit lib/lucideCategories.ts (intersection avec la version de lucide-react
// installée). La sortie est committée : cette régénération est rarement utile.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const META = join(__dirname, ".lucide-meta");

const root =
  existsSync(META) && readdirSync(META).find((d) => d.startsWith("lucide-"));
if (!root) {
  console.error(
    "Métadonnées absentes. Télécharge-les d'abord (voir l'en-tête de ce fichier).",
  );
  process.exit(1);
}
const ICONS_DIR = join(META, root, "icons");
const CATS_DIR = join(META, root, "categories");
const OUT = join(__dirname, "..", "lib", "lucideCategories.ts");

// 1) Noms d'icônes disponibles dans la version installée de lucide-react.
//    (import direct du fichier .mjs : le subpath n'est pas exposé via exports)
const dynUrl = pathToFileURL(
  join(__dirname, "..", "node_modules", "lucide-react", "dynamicIconImports.mjs"),
).href;
const dyn = (await import(dynUrl)).default;
const available = new Set(Object.keys(dyn));

// 2) Titres des catégories (kebab name -> Title).
const catTitle = {};
for (const f of readdirSync(CATS_DIR)) {
  if (!f.endsWith(".json")) continue;
  const name = basename(f, ".json");
  try {
    const j = JSON.parse(readFileSync(join(CATS_DIR, f), "utf8"));
    catTitle[name] = j.title ?? name;
  } catch {}
}

// 3) Pour chaque icône disponible, lire ses catégories.
const catMembers = {}; // name -> Set(iconName)
let uncategorized = [];
for (const f of readdirSync(ICONS_DIR)) {
  if (!f.endsWith(".json")) continue;
  const icon = basename(f, ".json");
  if (!available.has(icon)) continue;
  let cats = [];
  try {
    const j = JSON.parse(readFileSync(join(ICONS_DIR, f), "utf8"));
    cats = Array.isArray(j.categories) ? j.categories : [];
  } catch {}
  if (cats.length === 0) {
    uncategorized.push(icon);
    continue;
  }
  for (const c of cats) {
    (catMembers[c] ??= new Set()).add(icon);
  }
}

// 4) Icônes disponibles mais absentes de l'archive (versions désynchronisées).
for (const icon of available) {
  const seen = Object.values(catMembers).some((s) => s.has(icon));
  if (!seen && !uncategorized.includes(icon)) uncategorized.push(icon);
}

// 5) Ordre des catégories = ordre alphabétique du nom kebab (= ordre du site).
const orderedNames = Object.keys(catMembers).sort();

const categories = orderedNames.map((name) => ({
  title: catTitle[name] ?? name,
  icons: [...catMembers[name]].sort(),
}));

if (uncategorized.length) {
  categories.push({ title: "Autres", icons: uncategorized.sort() });
}

const total = available.size;
const header = `// FICHIER GÉNÉRÉ — ne pas éditer à la main.
// Régénérer avec : node scripts/gen-lucide-categories.mjs (voir le script).
// ${categories.length} catégories, ${total} icônes (lucide-react installé).

export type LucideCategory = { title: string; icons: string[] };

export const LUCIDE_CATEGORIES: LucideCategory[] = ${JSON.stringify(categories, null, 2)};

export const LUCIDE_ALL_ICONS: string[] = ${JSON.stringify([...available].sort())};
`;

writeFileSync(OUT, header, "utf8");
console.log(`OK -> ${OUT}`);
console.log(`${categories.length} catégories, ${total} icônes.`);
console.log("Aperçu:", categories.slice(0, 6).map((c) => `${c.title}(${c.icons.length})`).join(", "));
if (!existsSync(OUT)) process.exit(1);
