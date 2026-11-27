import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// `personas.sheet_complete` est une colonne tenue à jour par des
// déclencheurs, et `is_persona_usable` (la politique d'insertion de
// `chat_messages`) comme le cadenas du sélecteur la lisent telle quelle.
// Toute règle qui change la complétude d'une fiche doit donc déclencher un
// recalcul ; sinon le persona reste bloqué alors que
// `persona_sheet_is_complete` le dit complet (71 personas en prod le
// 2026-11-26, après la suppression de la fiche par défaut de leur monde).

const MIGRATIONS = path.join(process.cwd(), "migrations");
const lire = (nom: string) => readFileSync(path.join(MIGRATIONS, nom), "utf8");
const sql = lire("271_persona_sheet_complete_refresh.sql");

/** Tout le SQL des migrations, dans l'ordre : une règle peut venir de plus tôt. */
const tout = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map(lire)
  .join("\n");

/** Le corps d'une fonction, de son en-tête au `$$;` qui la ferme. */
function corps(source: string, nom: string): string {
  const debut = source.indexOf(`FUNCTION public.${nom}(`);
  expect(debut, `fonction ${nom} absente`).toBeGreaterThanOrEqual(0);
  const fin = source.indexOf("$$;", debut);
  return source.slice(debut, fin);
}

describe("migration 271 — sheet_complete suit le modèle du monde", () => {
  it("un déclencheur sur personas suit le modèle : création, suppression, dé-templatage, corbeille, changement de monde", () => {
    const m = sql.match(
      /CREATE TRIGGER trg_personas_sheet_complete_template\s+AFTER ([^\n]+?)\s+ON public\.personas\s+FOR EACH ROW EXECUTE FUNCTION public\.tg_personas_sheet_complete_template\(\)/,
    );
    expect(m).not.toBeNull();
    const evenements = m![1];
    expect(evenements).toMatch(/\bINSERT\b/);
    expect(evenements).toMatch(/\bDELETE\b/);
    const colonnes = evenements.match(/UPDATE OF ([\w, ]+)/)![1].split(",").map((c) => c.trim());
    expect(colonnes.sort()).toEqual(["deleted_at", "is_template", "world_id"]);
    // Le recalcul écrit `sheet_complete` : jamais dans la liste, pas de boucle.
    expect(colonnes).not.toContain("sheet_complete");
  });

  it("la fonction du déclencheur tourne sous son propriétaire, fermée aux clients", () => {
    const f = corps(sql, "tg_personas_sheet_complete_template");
    expect(f).toMatch(/SECURITY DEFINER/);
    expect(f).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.tg_personas_sheet_complete_template\(\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("un modèle supprimé recalcule les fiches de son monde", () => {
    const f = corps(sql, "tg_personas_sheet_complete_template");
    expect(f).toMatch(/TG_OP = 'DELETE'[\s\S]*?OLD\.is_template[\s\S]*?refresh_world_sheets_complete\(OLD\.world_id\)/);
  });

  it("un modèle créé, dé-templaté, mis en corbeille ou déplacé recalcule l'ancien et le nouveau monde", () => {
    const f = corps(sql, "tg_personas_sheet_complete_template");
    expect(f).toMatch(/OLD\.is_template OR NEW\.is_template/);
    expect(f).toMatch(/refresh_world_sheets_complete\(OLD\.world_id\)/);
    expect(f).toMatch(/refresh_world_sheets_complete\(NEW\.world_id\)/);
  });

  it("un persona qui naît ou change de monde suit la règle entière, faceclaim compris", () => {
    // Le BEFORE INSERT / BEFORE UPDATE OF world_id (181, 260) ne regarde que
    // les champs du modèle : un monde qui exige un faceclaim le laissait jouer.
    const f = corps(sql, "tg_personas_sheet_complete_template");
    expect(f).toMatch(/refresh_persona_sheet_complete\(NEW\.id\)/);
  });

  it("rattrapage : toute fiche active est recalculée d'après persona_sheet_is_complete", () => {
    expect(sql).toMatch(
      /UPDATE public\.personas p\s+SET sheet_complete = public\.persona_sheet_is_complete\(p\.id\)\s+WHERE NOT p\.is_template AND p\.deleted_at IS NULL AND p\.world_id IS NOT NULL\s+AND p\.sheet_complete IS DISTINCT FROM public\.persona_sheet_is_complete\(p\.id\);/,
    );
  });
});

describe("chaque cause d'un changement de complétude a son déclencheur", () => {
  it("champ du modèle ajouté, retiré, ou `required` basculé (181)", () => {
    expect(tout).toMatch(
      /CREATE TRIGGER trg_persona_field_sheet_complete\s+AFTER INSERT OR UPDATE OF data, type, required, template_field_id OR DELETE ON public\.persona_section_fields/,
    );
    const f = corps(tout, "tg_persona_field_sheet_complete");
    expect(f).toMatch(/NEW\.required IS DISTINCT FROM OLD\.required/);
    expect(f).toMatch(/refresh_world_sheets_complete\(v_world\)/);
  });

  it("section du modèle supprimée (181)", () => {
    expect(tout).toMatch(/CREATE TRIGGER trg_persona_section_sheet_complete\s+AFTER DELETE ON public\.persona_sections/);
  });

  it("require_faceclaim ou enable_faceclaims modifiés (191)", () => {
    expect(tout).toMatch(
      /CREATE TRIGGER trg_world_faceclaim_sheets_complete\s+AFTER UPDATE OF require_faceclaim, enable_faceclaims ON public\.worlds/,
    );
  });

  it("modèle créé, supprimé, dé-templaté ou mis en corbeille (271)", () => {
    expect(tout).toMatch(/CREATE TRIGGER trg_personas_sheet_complete_template/);
  });
});
