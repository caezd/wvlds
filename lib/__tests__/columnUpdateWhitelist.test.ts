import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { workingSources } from "@/test/sourceFiles";

// ──────────────────────────────────────────────────────────────────────────
// La RLS dit QUELLES LIGNES un compte peut modifier, jamais QUELLES COLONNES.
// Le navigateur écrit directement dans Supabase : quiconque peut modifier une
// ligne peut y réécrire n'importe quelle colonne depuis la console, quel que
// soit le formulaire affiché. C'est ainsi qu'un membre doté de
// `world.settings` pouvait réécrire `worlds.owner_id`, un joueur cocher
// `personas.is_template` (quota contourné) ou déplacer son message dans le
// salon d'un autre monde (`chat_messages.chat_id`). Corrigé par la migration
// 258 : sur ces tables, `authenticated` n'a plus que des droits UPDATE par
// colonne, en liste blanche.
//
// Ce contrôle rejoue les migrations et vérifie l'état FINAL :
//   1. chaque table gardée retire l'UPDATE global puis accorde ses colonnes
//      une à une, sans jamais accorder une colonne interdite ;
//   2. toute colonne ajoutée à une table gardée APRÈS la mise en liste
//      blanche fait l'objet d'une décision : accordée (GRANT UPDATE (col))
//      ou inscrite ci-dessous comme non modifiable. Une colonne oubliée
//      échoue en écriture côté client — c'est voulu, mais mieux vaut le
//      savoir ici qu'en production.
// ──────────────────────────────────────────────────────────────────────────

const MIGRATIONS = join(process.cwd(), "migrations");

/** Colonnes qu'un client ne doit JAMAIS pouvoir réécrire, par table gardée. */
const NEVER_UPDATABLE: Record<string, string[]> = {
  profiles: ["id", "created_at", "is_subscribed", "plan", "is_admin", "patreon_managed"],
  worlds: ["id", "owner_id", "created_at", "updated_at"],
  personas: [
    "id", "user_id", "created_at", "updated_at", "deleted_at",
    "is_template", "is_npc", "sheet_complete", "review_status", "reviewed_by", "reviewed_at",
  ],
  chat_messages: [
    "id", "chat_id", "author_id", "created_at", "persona_id", "world_id",
    "visible_to", "reply_to_id", "insert_before_id", "inserted_at",
    // Le lancer publié (migration 270) : posé à l'insertion, jamais changé.
    "dice_roll_id",
    // L'ellipse publiée (migration 275) : posée à l'insertion, jamais changée.
    "ellipse_id",
  ],
  chatrooms: [
    "id", "world_id", "created_by", "created_at", "updated_at",
    // Le temps du salon (migration 275) : écrit par set_chatroom_day et
    // post_chatroom_ellipse seulement, qui vérifient les droits.
    "day_icon", "day_position", "day_from_icon", "day_from_position", "day_skipped", "timeline_current_date",
    // Le temps en cours (migration 277) : avancé par post_chatroom_ellipse seulement.
    "day_current_icon", "day_current_position",
  ],
  dm_messages: ["id", "conversation_id", "author_id", "created_at"],
  persona_relations: [
    "id", "world_id", "from_persona_id", "to_persona_id", "created_by", "created_at",
    "status", "label", "bidirectional",
  ],
};

type TableState = { guarded: boolean; granted: Set<string>; guardedFrom: number | null };

function migrationFiles(): { file: string; number: number; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      number: Number.parseInt(file, 10),
      // Les en-têtes commentés citent souvent les instructions qu'ils remplacent.
      sql: readFileSync(join(MIGRATIONS, file), "utf-8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n"),
    }));
}

const columnsOf = (list: string) =>
  list
    .split(",")
    .map((c) => c.trim().replace(/"/g, ""))
    .filter(Boolean);

/** Rejoue les REVOKE / GRANT UPDATE sur les tables gardées, dans l'ordre. */
function finalGrants(): Map<string, TableState> {
  const state = new Map<string, TableState>();
  for (const table of Object.keys(NEVER_UPDATABLE)) {
    state.set(table, { guarded: false, granted: new Set(), guardedFrom: null });
  }

  for (const { number, sql } of migrationFiles()) {
    const statements = sql.split(";");
    for (const stmt of statements) {
      const revoke = /REVOKE\s+UPDATE\s+ON\s+(?:TABLE\s+)?(?:public\.)?(\w+)\s+FROM\s+[^;]*\bauthenticated\b/i.exec(stmt);
      if (revoke && state.has(revoke[1])) {
        const s = state.get(revoke[1])!;
        s.guarded = true;
        s.granted = new Set();
        s.guardedFrom ??= number;
      }
      const tableGrant = /GRANT\s+UPDATE\s+ON\s+(?:TABLE\s+)?(?:public\.)?(\w+)\s+TO\s+[^;]*\bauthenticated\b/i.exec(stmt);
      if (tableGrant && state.has(tableGrant[1])) {
        state.get(tableGrant[1])!.guarded = false;
      }
      for (const m of stmt.matchAll(/GRANT\s+UPDATE\s*\(([^)]*)\)\s*ON\s+(?:TABLE\s+)?(?:public\.)?(\w+)\s+TO\s+[^;]*\bauthenticated\b/gi)) {
        const s = state.get(m[2]);
        if (s) for (const c of columnsOf(m[1])) s.granted.add(c);
      }
    }
  }
  return state;
}

/** Colonnes ajoutées par ALTER TABLE … ADD COLUMN, avec le numéro de migration. */
function addedColumns(): { table: string; column: string; number: number; file: string }[] {
  const out: { table: string; column: string; number: number; file: string }[] = [];
  for (const { file, number, sql } of migrationFiles()) {
    for (const stmt of sql.split(";")) {
      const alter = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?(\w+)\s+([\s\S]*)/i.exec(stmt);
      if (!alter || !(alter[1] in NEVER_UPDATABLE)) continue;
      for (const m of alter[2].matchAll(/ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) {
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)$/i.test(m[1])) continue;
        out.push({ table: alter[1], column: m[1], number, file });
      }
    }
  }
  return out;
}

describe("liste blanche des colonnes modifiables par le client", () => {
  const grants = finalGrants();

  it("chaque table gardée retire l'UPDATE global au rôle authenticated", () => {
    const open = [...grants.entries()].filter(([, s]) => !s.guarded).map(([t]) => t);
    expect(open, `UPDATE accordé sur toute la table : ${open.join(", ")}`).toEqual([]);
  });

  it("aucune colonne interdite n'est accordée", () => {
    const leaks: string[] = [];
    for (const [table, forbidden] of Object.entries(NEVER_UPDATABLE)) {
      const granted = grants.get(table)!.granted;
      for (const c of forbidden) if (granted.has(c)) leaks.push(`${table}.${c}`);
    }
    expect(leaks, `Colonnes sensibles accordées en écriture : ${leaks.join(", ")}`).toEqual([]);
  });

  it("chaque table gardée garde au moins une colonne modifiable", () => {
    // Un REVOKE sans GRANT casserait toutes les écritures légitimes.
    for (const [table, s] of grants) {
      expect(s.granted.size, `${table} : aucune colonne accordée`).toBeGreaterThan(0);
    }
  });

  it("toute colonne ajoutée après la mise en liste blanche est décidée", () => {
    const undecided = addedColumns()
      .filter(({ table, number }) => {
        const from = grants.get(table)!.guardedFrom;
        // Les colonnes ajoutées juste avant la mise en liste blanche, encore
        // en attente d'application (257), sont couvertes par le même examen.
        return from !== null && number >= from - 1;
      })
      .filter(({ table, column }) => !grants.get(table)!.granted.has(column) && !NEVER_UPDATABLE[table].includes(column))
      .map(({ table, column, file }) => `  ${table}.${column} (${file})`);

    expect(
      undecided,
      undecided.length
        ? "Colonnes ajoutées à une table gardée sans décision :\n" +
            undecided.join("\n") +
            "\n\nSoit le client doit pouvoir l'écrire : ajouter dans la migration\n" +
            "  GRANT UPDATE (colonne) ON public.<table> TO authenticated;\n" +
            "soit elle ne s'écrit que côté serveur : l'inscrire dans NEVER_UPDATABLE."
        : "",
    ).toEqual([]);
  });

  it("le rejeu sait lire un REVOKE suivi d'un GRANT par colonne", () => {
    // profiles est en liste blanche depuis la migration 089.
    const profiles = grants.get("profiles")!;
    expect(profiles.guarded).toBe(true);
    expect(profiles.granted.has("username")).toBe(true);
    expect(profiles.granted.has("is_admin")).toBe(false);
  });
});

describe("notifications : écrites par la base seule", () => {
  /** Policies finales sur notifications : nom → commande. */
  function notificationPolicies(): Map<string, string> {
    const policies = new Map<string, string>();
    for (const { sql } of migrationFiles()) {
      for (const m of sql.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+)\s+ON\s+(?:public\.)?notifications\b/gi)) {
        policies.delete(m[1].replace(/"/g, ""));
      }
      for (const m of sql.matchAll(/CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+(?:public\.)?notifications\b([^;]*)/gi)) {
        const cmd = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i.exec(m[2])?.[1].toUpperCase() ?? "ALL";
        policies.set(m[1].replace(/"/g, ""), cmd);
      }
    }
    return policies;
  }

  it("aucune policy ne laisse un client insérer une notification", () => {
    // Une insertion directe laissait choisir destinataire, nom d'expéditeur et
    // contenu : n'importe qui pouvait « inviter » n'importe qui au nom de
    // n'importe qui. Les notifications naissent de triggers et de RPC.
    const inserts = [...notificationPolicies()].filter(([, cmd]) => cmd === "INSERT" || cmd === "ALL").map(([n]) => n);
    expect(inserts).toEqual([]);
  });

  it("le code client n'insère pas dans notifications", () => {
    const offenders = workingSources(["app/**/*.ts", "app/**/*.tsx", "components/**/*.tsx", "components/**/*.ts", "lib/**/*.ts", "hooks/**/*.ts"])
      .filter(({ file }) => !file.includes("__tests__"))
      .filter(({ source }) =>
        /from\(\s*(?:TABLE\.NOTIFICATIONS|["']notifications["'])\s*\)\s*\.(?:insert|upsert)\(/.test(source),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
