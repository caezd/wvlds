import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Une policy de LECTURE en `USING (true)` ouvre la table entière à tout le rôle
// visé. C'est parfois voulu, jamais anodin — et facile à écrire sans y penser
// quand on vient d'écrire une policy d'écriture soigneusement gardée.
//
// C'est exactement ce qui était arrivé à `chat_choice_votes` : insérer un vote
// exigeait d'être membre du monde, mais les lire n'exigeait rien. Tout compte
// connecté lisait qui avait voté quoi, dans tous les mondes, y compris privés.
// Constaté sous une fausse identité membre d'aucun monde : 0 salon visible,
// 0 message visible, et la totalité des votes. Corrigé par la migration 132.
//
// Ce contrôle rejoue les migrations et ne juge que l'état FINAL de chaque
// policy : une ouverture ancienne, refermée depuis, ne compte pas.
//
// L'ouverture reste possible — il faut l'inscrire ci-dessous avec sa raison.
// ──────────────────────────────────────────────────────────────────────────

const RACINE = process.cwd();
const MIGRATIONS = join(RACINE, "migrations");

/**
 * Tables dont la lecture est délibérément ouverte à tout le rôle visé.
 *
 * Toute autre table en `USING (true)` fait échouer le contrôle. Ajouter une
 * entrée ici est un choix à assumer, pas une formalité.
 */
const OUVERTURES_ASSUMEES: Record<string, string> = {
  feature_flags:
    "drapeaux de fonctionnalité — l'application les lit à chaque rendu, ils ne " +
    "décrivent aucun utilisateur",
  profiles:
    "annuaire des comptes — pseudo et avatar servent partout (mentions, " +
    "recherche, listes de membres). Les colonnes sensibles (plan, is_admin, " +
    "patreon_managed) sont en lecture seule et ne trahissent rien d'exploitable",
  user_equipped_cosmetics:
    "cosmétiques portés — visibles de fait dès qu'un avatar s'affiche",
  cosmetic_items: "catalogue de la boutique, identique pour tout le monde",
  world_tags: "étiquettes des mondes publics, servent à l'explorateur",
};

type Policy = { table: string; cmd: string; using: string | null; source: string };

/** Rejoue les migrations et rend l'état final des policies, par table et nom. */
function policiesFinales(): Map<string, Policy> {
  const etat = new Map<string, Policy>();

  const fichiers: [string, string][] = [];
  const backup = join(RACINE, ".backup");
  if (existsSync(backup)) fichiers.push([".backup", readFileSync(backup, "utf-8")]);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    fichiers.push([f, readFileSync(join(MIGRATIONS, f), "utf-8")]);
  }

  const nom = (s: string) => s.replace(/^["']|["']$/g, "").trim();

  for (const [fichier, brut] of fichiers) {
    // Les en-têtes commentés citent souvent les policies qu'ils remplacent.
    const sql = brut
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    for (const m of sql.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+)\s+ON\s+(?:public\.)?(\w+)/gi)) {
      etat.delete(`${m[2]}|${nom(m[1])}`);
    }

    // Fenêtre bornée puis coupe au premier `;` : une seule expression
    // régulière couvrant tout le corps part en explosion combinatoire sur les
    // 341 Ko de `.backup`.
    for (const m of sql.matchAll(/CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+(?:public\.)?(\w+)/gi)) {
      const depart = m.index + m[0].length;
      const fenetre = sql.slice(depart, depart + 3000);
      const fin = fenetre.indexOf(";");
      const corps = fin === -1 ? fenetre : fenetre.slice(0, fin);

      const cmd = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i.exec(corps)?.[1].toUpperCase() ?? "ALL";
      const using = /\bUSING\s*\(([\s\S]*?)\)\s*(?:WITH\s+CHECK|$)/i.exec(corps)?.[1] ?? null;

      etat.set(`${m[2]}|${nom(m[1])}`, { table: m[2], cmd, using, source: fichier });
    }
  }
  return etat;
}

/** L'expression laisse-t-elle passer toutes les lignes ? */
function laisseToutPasser(using: string | null): boolean {
  if (using === null) return false;
  return /^\(*\s*true\s*\)*$/i.test(using.trim());
}

describe("policies de lecture inconditionnelles", () => {
  it("aucune table n'ouvre sa lecture sans l'avoir assumé", () => {
    const ouvertes = [...policiesFinales().values()]
      .filter((p) => (p.cmd === "SELECT" || p.cmd === "ALL") && laisseToutPasser(p.using))
      .filter((p) => !(p.table in OUVERTURES_ASSUMEES))
      .map((p) => `  ${p.table} — policy ${p.cmd} en USING (true) (${p.source})`);

    expect(
      ouvertes,
      ouvertes.length
        ? "Lecture ouverte à tout le rôle visé, sans justification enregistrée :\n" +
            ouvertes.join("\n") +
            "\n\nSoit la policy doit filtrer (appartenance au monde, propriété…),\n" +
            "soit l'ouverture est voulue et doit être inscrite dans\n" +
            "OUVERTURES_ASSUMEES avec sa raison."
        : "",
    ).toEqual([]);
  });

  it("reconnaît les formes de `true` et rien d'autre", () => {
    // Le contrôle ne vaut que si sa règle sait dire oui ET non.
    expect(laisseToutPasser("true")).toBe(true);
    expect(laisseToutPasser("(true)")).toBe(true);
    expect(laisseToutPasser("  TRUE  ")).toBe(true);

    expect(laisseToutPasser("user_id = auth.uid()")).toBe(false);
    expect(laisseToutPasser("is_world_member(world_id, auth.uid())")).toBe(false);
    expect(laisseToutPasser(null)).toBe(false);
  });

  it("chaque ouverture assumée porte une raison lisible", () => {
    for (const [table, raison] of Object.entries(OUVERTURES_ASSUMEES)) {
      expect(raison.length, `raison trop courte pour ${table}`).toBeGreaterThan(30);
    }
  });
});
