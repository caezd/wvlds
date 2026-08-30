import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Toute fonction `SECURITY DEFINER` doit nommer `pg_temp` EN DERNIER dans son
// `search_path`.
//
// Pourquoi. PostgreSQL cherche le schéma temporaire en PREMIER quand `pg_temp`
// n'est pas listé explicitement. Écrire `SET search_path = public` ne protège
// donc de rien : une table temporaire homonyme passe devant la vraie, et une
// fonction `SECURITY DEFINER` — qui s'exécute avec les droits de son
// propriétaire — lit la table de l'attaquant. `authenticated` comme `anon` ont
// le droit TEMP sur cette base.
//
// Ce n'était pas théorique. Le 2026-08-28, 54 des 67 fonctions du schéma
// étaient dans ce cas, dont neuf lisant des tables sans les qualifier —
// `find_or_create_dm` et `search_dm_users` vérifient les blocages par
// `FROM user_blocks`, qu'une table temporaire vide suffisait à neutraliser.
// Corrigé par la migration 131.
//
// Le contrôle rejoue les migrations dans l'ordre et ne juge que l'ÉTAT FINAL de
// chaque fonction : une définition ancienne sans `pg_temp` est acceptable si une
// migration ultérieure la corrige — c'est exactement ce que fait la 131.
// ──────────────────────────────────────────────────────────────────────────

const RACINE = process.cwd();
const MIGRATIONS = join(RACINE, "migrations");

type Etat = { definer: boolean; searchPath: string | null; source: string };

/** Rejoue le SQL du dépôt et rend l'état final de chaque fonction. */
function etatFinalDesFonctions(): Map<string, Etat> {
  const etats = new Map<string, Etat>();

  const fichiers: [string, string][] = [];
  const backup = join(RACINE, ".backup");
  if (existsSync(backup)) fichiers.push([".backup", readFileSync(backup, "utf-8")]);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    fichiers.push([f, readFileSync(join(MIGRATIONS, f), "utf-8")]);
  }

  for (const [nom, brut] of fichiers) {
    // Les en-têtes commentés décrivent souvent les fonctions : les ignorer,
    // sans quoi la démonstration d'attaque de la 131 serait lue comme du code.
    const sql = brut
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    // CREATE [OR REPLACE] FUNCTION — on repère le nom, puis on lit une fenêtre
    // bornée après lui, coupée au délimiteur de corps `AS $…$`.
    //
    // Volontairement PAS une seule expression régulière couvrant l'en-tête
    // entier : deux quantificateurs paresseux imbriqués sur les 341 Ko de
    // `.backup` partent en explosion combinatoire, et le worker de test expire
    // au bout d'une minute sans rien dire d'utile.
    const creation = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
    for (const m of sql.matchAll(creation)) {
      const fenetre = sql.slice(m.index + m[0].length, m.index + m[0].length + 800);
      const finEntete = fenetre.search(/\bAS\s+\$/i);
      const entete = finEntete === -1 ? fenetre : fenetre.slice(0, finEntete);
      etats.set(m[1], {
        definer: /SECURITY\s+DEFINER/i.test(entete),
        searchPath: lireSearchPath(entete),
        source: nom,
      });
    }

    // DROP FUNCTION : la fonction sort du décompte. Sans cela, deux fonctions
    // supprimées depuis longtemps (`lock_persona_field` par la 059,
    // `get_world_unreads` par la 129) seraient reprochées à un correctif qui
    // n'a aucune raison de les citer — elles n'existent plus en base.
    const suppression = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
    for (const m of sql.matchAll(suppression)) etats.delete(m[1]);

    // ALTER FUNCTION … SET search_path = … : ne change que le chemin.
    const alter =
      /ALTER\s+FUNCTION\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+SET\s+search_path\s*(?:=|TO)\s*([^;]+);/gi;
    for (const m of sql.matchAll(alter)) {
      const precedent = etats.get(m[1]);
      if (!precedent) continue; // fonction d'un autre schéma, hors sujet
      etats.set(m[1], { ...precedent, searchPath: m[2].trim(), source: nom });
    }
  }
  return etats;
}

function lireSearchPath(entete: string): string | null {
  const m = /SET\s+search_path\s*(?:=|TO)\s*([^\n]+)/i.exec(entete);
  return m ? m[1].trim() : null;
}

/** `pg_temp` figure-t-il, et en dernière position ? */
function pgTempEnDernier(chemin: string | null): boolean {
  if (!chemin) return false;
  const entrees = chemin
    .split(",")
    .map((e) => e.trim().replace(/^'|'$/g, "").replace(/\s+AS\s+\$.*$/i, "").trim())
    .filter(Boolean);
  return entrees.length > 0 && entrees[entrees.length - 1].toLowerCase() === "pg_temp";
}

describe("search_path des fonctions SECURITY DEFINER", () => {
  it("toutes nomment pg_temp en dernier, une fois les migrations rejouées", () => {
    const manquantes = [...etatFinalDesFonctions().entries()]
      .filter(([, e]) => e.definer && !pgTempEnDernier(e.searchPath))
      .map(([nom, e]) => `  ${nom} — search_path = ${e.searchPath ?? "(aucun)"} (${e.source})`);

    expect(
      manquantes,
      manquantes.length
        ? "Fonctions SECURITY DEFINER dont le search_path ne finit pas par pg_temp.\n" +
            "Sans lui, PostgreSQL cherche le schéma temporaire EN PREMIER et une table\n" +
            "temporaire homonyme masque la vraie :\n" +
            manquantes.join("\n") +
            "\n\nAjoutez `, pg_temp` à la fin de leur search_path."
        : "",
    ).toEqual([]);
  });

  it("reconnaît un search_path correct et refuse les autres", () => {
    // Le contrôle ci-dessus ne vaut que si sa règle sait dire non.
    expect(pgTempEnDernier("public, pg_temp")).toBe(true);
    expect(pgTempEnDernier("public, extensions, pg_temp")).toBe(true);
    expect(pgTempEnDernier("'public', 'extensions', 'pg_temp'")).toBe(true);

    expect(pgTempEnDernier("public")).toBe(false);
    expect(pgTempEnDernier("'public'")).toBe(false);
    expect(pgTempEnDernier(null)).toBe(false);
    // pg_temp présent mais PAS en dernier : il repasse devant `public`, donc
    // la protection tombe. C'est bien un refus.
    expect(pgTempEnDernier("pg_temp, public")).toBe(false);
  });

  it("la migration 131 couvre ce que la base contenait", () => {
    // Repère explicite : ce fichier est la correction, et le contrôle
    // ci-dessus s'appuie sur lui pour l'état final de 54 fonctions.
    const sql = readFileSync(
      join(MIGRATIONS, "131_pg_temp_last_on_security_definer.sql"),
      "utf-8",
    );
    const alters = sql.split("\n").filter((l) => l.startsWith("ALTER FUNCTION"));
    expect(alters).toHaveLength(54);
    for (const nom of ["find_or_create_dm", "search_dm_users", "block_user", "award_event"]) {
      expect(sql, `fonction exposée absente du correctif : ${nom}`).toContain(
        `ALTER FUNCTION public.${nom}(`,
      );
    }
  });
});
