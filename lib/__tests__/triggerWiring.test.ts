import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Une fonction `RETURNS trigger` que rien ne câble ne s'exécute jamais.
//
// C'est ce qui est arrivé à `handle_user_deletion` : la migration 125 la
// réécrit et détaille son rôle sur vingt lignes, mais le `CREATE TRIGGER` qui
// l'invoque n'a jamais figuré dans le dépôt — il n'existait que dans la base,
// posé à la main. Une reconstruction donnait donc une application où fermer son
// compte laissait ses personnages et ses mondes vivants et sans propriétaire,
// au lieu de les marquer supprimés. Réparé par la migration 134.
//
// Le défaut est silencieux par nature : rien ne casse, la fonction est là,
// elle ne sert simplement à rien. Aucun test d'interface ne peut le voir.
//
// Ce contrôle rejoue les migrations et n'accepte que deux issues pour une
// fonction de déclencheur : câblée, ou supprimée.
// ──────────────────────────────────────────────────────────────────────────

const RACINE = process.cwd();
const MIGRATIONS = join(RACINE, "migrations");

type Analyse = {
  /** Fonctions `RETURNS trigger`, avec le fichier qui les déclare en dernier. */
  fonctions: Map<string, string>;
  /** Fonctions citées par un `EXECUTE FUNCTION` / `EXECUTE PROCEDURE`. */
  cablees: Set<string>;
  supprimees: Set<string>;
};

function analyserLeDepot(): Analyse {
  const fonctions = new Map<string, string>();
  const cablees = new Set<string>();
  const supprimees = new Set<string>();

  const fichiers: [string, string][] = [];
  const backup = join(RACINE, ".backup");
  if (existsSync(backup)) fichiers.push([".backup", readFileSync(backup, "utf-8")]);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    fichiers.push([f, readFileSync(join(MIGRATIONS, f), "utf-8")]);
  }

  for (const [nom, brut] of fichiers) {
    const sql = brut
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    // Fenêtre bornée puis coupe au délimiteur de corps : une expression
    // régulière couvrant l'en-tête entier explose sur les 341 Ko de `.backup`.
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi)) {
      const fenetre = sql.slice(m.index + m[0].length, m.index + m[0].length + 600);
      const fin = fenetre.search(/\bAS\s+\$/i);
      const entete = fin === -1 ? fenetre : fenetre.slice(0, fin);
      if (/RETURNS\s+trigger/i.test(entete)) fonctions.set(m[1], nom);
    }

    for (const m of sql.matchAll(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
      supprimees.add(m[1]);
    }
    for (const m of sql.matchAll(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?(\w+)/gi)) {
      cablees.add(m[1]);
    }
  }
  return { fonctions, cablees, supprimees };
}

describe("câblage des fonctions de déclencheur", () => {
  it("aucune fonction RETURNS trigger n'est laissée orpheline", () => {
    const { fonctions, cablees, supprimees } = analyserLeDepot();

    const orphelines = [...fonctions.entries()]
      .filter(([nom]) => !cablees.has(nom) && !supprimees.has(nom))
      .map(([nom, source]) => `  ${nom} — déclarée dans ${source}, aucun CREATE TRIGGER ne l'appelle`);

    expect(
      orphelines,
      orphelines.length
        ? "Fonctions de déclencheur que rien ne câble. Elles ne s'exécuteront jamais\n" +
            "sur une base reconstruite depuis ce dépôt :\n" +
            orphelines.join("\n") +
            "\n\nAjoutez le `CREATE TRIGGER` correspondant, ou supprimez la fonction."
        : "",
    ).toEqual([]);
  });

  it("trouve bien les fonctions de déclencheur, et pas les autres", () => {
    // Un contrôle qui n'analyserait rien passerait aussi : on vérifie qu'il
    // voit une population plausible, et que `handle_user_deletion` en fait
    // partie — c'est elle qui manquait.
    const { fonctions, cablees } = analyserLeDepot();
    expect(fonctions.size).toBeGreaterThan(20);
    expect(fonctions.has("handle_user_deletion")).toBe(true);
    expect(cablees.has("handle_user_deletion")).toBe(true);
    // Une fonction ordinaire ne doit pas y figurer.
    expect(fonctions.has("is_world_member")).toBe(false);
  });

  it("la migration 134 câble les deux déclencheurs manquants", () => {
    const sql = readFileSync(join(MIGRATIONS, "134_missing_triggers.sql"), "utf-8");
    expect(sql).toContain("CREATE TRIGGER trg_auth_user_soft_delete");
    expect(sql).toContain("CREATE TRIGGER chatroom_categories_updated_at");
    // Jamais de DROP sur `auth.users` : cela ouvrirait une fenêtre pendant
    // laquelle une suppression de compte passerait sans soft-delete.
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i);
  });
});
