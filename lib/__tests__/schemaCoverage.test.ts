import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Le dépôt doit pouvoir reconstruire la base. Deux sources y concourent :
//
//   `.backup`        dump du 2026-06-05, le socle
//   `migrations/*`   les changements appliqués depuis
//
// Un audit du 2026-08-28 a montré que ce n'était plus vrai : dix tables de
// production n'apparaissaient dans NI l'une NI l'autre — créées à la main
// depuis le tableau de bord Supabase, et donc absentes d'une reconstruction.
// Parmi elles `chatroom_keys`, qui porte les clés de chiffrement des salons.
// La migration `000_baseline_missing_tables.sql` les a rapatriées.
//
// Ce test empêche la récidive. Il ne peut pas interroger la base ; il vérifie
// donc ce qui est vérifiable hors ligne, et qui aurait suffi à voir le défaut :
// toute table que le code interroge doit être déclarée quelque part dans le
// dépôt. Créer une table depuis le tableau de bord puis l'utiliser fait échouer
// ce test.
//
// Ce qu'il ne voit pas, et qu'aucune comparaison de noms ne verrait : une
// COLONNE ajoutée à la main sur une table déjà déclarée.
// ──────────────────────────────────────────────────────────────────────────

const RACINE = process.cwd();
const MIGRATIONS = join(RACINE, "migrations");
const SOURCES = ["app", "components", "lib", "hooks"];

/** Relations déclarées par le dépôt : tables, vues et vues matérialisées. */
function relationsDeclarees(): Set<string> {
  const noms = new Set<string>();

  // Le schéma est facultatif : `.backup` qualifie tout en `public.`, alors que
  // les migrations écrivent le plus souvent `CREATE TABLE IF NOT EXISTS x`.
  // Il est donc capturé explicitement, pour ne retenir que `public` — sans quoi
  // les tables `auth.` et `storage.` du dump entreraient dans le décompte.
  const recenser = (sql: string) => {
    const motif =
      /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:ONLY\s+)?(?:(\w+)\.)?("?)(\w+)\2/gi;
    for (const m of sql.matchAll(motif)) {
      if (m[1] && m[1].toLowerCase() !== "public") continue;
      noms.add(m[3]);
    }
  };

  const backup = join(RACINE, ".backup");
  if (existsSync(backup)) recenser(readFileSync(backup, "utf-8"));

  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    recenser(readFileSync(join(MIGRATIONS, f), "utf-8"));
  }
  return noms;
}

/**
 * Correspondance `TABLE.CHAT_PINS` → `chat_pins`, lue dans `lib/constants.ts`.
 *
 * La moitié du code passe par ce registre plutôt que par une chaîne littérale.
 * Sans le résoudre, le contrôle ci-dessous ignorerait ces appels — et c'est
 * précisément par là que passent `chat_pins` et `chatroom_keys`.
 */
function registreDesTables(): Map<string, string> {
  const src = readFileSync(join(RACINE, "lib", "constants.ts"), "utf-8");
  const bloc = src.match(/export\s+const\s+TABLE\s*=\s*\{([\s\S]*?)\}\s*as\s+const/);
  const par = new Map<string, string>();
  if (!bloc) return par;
  for (const m of bloc[1].matchAll(/(\w+)\s*:\s*"([a-z_]+)"/g)) par.set(m[1], m[2]);
  return par;
}

/** Relations interrogées par le code applicatif, via `.from("…")` ou `.from(TABLE.X)`. */
function relationsUtilisees(): Map<string, string[]> {
  const par = new Map<string, string[]>();
  const registre = registreDesTables();

  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        parcourir(chemin);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = readFileSync(chemin, "utf-8");
      for (const m of src.matchAll(/\.from\(\s*(?:"([a-z_]+)"|TABLE\.(\w+))\s*\)/g)) {
        const nom = m[1] ?? registre.get(m[2]);
        if (!nom) continue; // clé de registre inconnue : hors sujet ici
        const rel = chemin.slice(RACINE.length + 1).split(sep).join("/");
        const liste = par.get(nom) ?? [];
        if (!liste.includes(rel)) liste.push(rel);
        par.set(nom, liste);
      }
    }
  };

  for (const d of SOURCES) {
    const chemin = join(RACINE, d);
    if (existsSync(chemin)) parcourir(chemin);
  }
  return par;
}

describe("le dépôt déclare le schéma qu'il utilise", () => {
  it("toute relation interrogée par le code est déclarée dans le dépôt", () => {
    const declarees = relationsDeclarees();
    const utilisees = relationsUtilisees();

    const manquantes = [...utilisees.entries()]
      .filter(([nom]) => !declarees.has(nom))
      .map(([nom, fichiers]) => `  ${nom} — utilisée dans ${fichiers.join(", ")}`);

    expect(
      manquantes,
      manquantes.length
        ? "Relations utilisées par le code mais déclarées nulle part dans le dépôt.\n" +
            "Une reconstruction depuis `.backup` + `migrations/` les omettrait :\n" +
            manquantes.join("\n") +
            "\n\nAjoutez une migration qui les crée."
        : "",
    ).toEqual([]);
  });

  it("le complément de socle couvre bien les dix tables jamais versionnées", () => {
    // Garde le fichier 000 intact : c'est lui qui rend la reconstruction
    // possible, et rien d'autre dans le dépôt ne décrit ces tables.
    const sql = readFileSync(join(MIGRATIONS, "000_baseline_missing_tables.sql"), "utf-8");
    for (const t of [
      "chat_pins",
      "chatroom_follows",
      "chatroom_keys",
      "feature_flags",
      "persona_group_assignments",
      "persona_relations",
      "user_canvas_positions",
      "world_lexicon_terms",
      "world_persona_groups",
      "world_relation_types",
    ]) {
      expect(sql, `table absente du complément de socle : ${t}`).toContain(
        `CREATE TABLE IF NOT EXISTS public.${t} `,
      );
      // Sans activation, une base reconstruite exposerait la table à tous.
      expect(sql, `sécurité au niveau ligne non activée pour ${t}`).toMatch(
        new RegExp(String.raw`ALTER TABLE public\.${t}\s+ENABLE ROW LEVEL SECURITY`),
      );
    }
  });

  it("le complément de socle passe avant les migrations qui modifient ces tables", () => {
    // Les migrations se rejouent dans l'ordre des noms : la 126 pose des bornes
    // de longueur sur ces tables, la 120 réécrit les règles de `chatroom_keys`.
    // Un préfixe qui ne trie pas en tête casserait la reconstruction.
    const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    expect(fichiers[0]).toBe("000_baseline_missing_tables.sql");
  });
});
