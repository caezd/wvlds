import type { PersonaSectionWithFields, PersonaSectionField } from "@/types/personas";

// ──────────────────────────────────────────────────────────────────────────
// Ce que la fiche a fait de ses sections, et comment l'écrire.
//
// Les onglets et leurs champs s'écrivaient à chaque geste : un champ ajouté
// par erreur restait, et le bouton « Enregistrer » de la fiche n'aurait rien
// dit d'eux. Ils ne touchent plus la base ; l'arbre vit en mémoire, avec des
// identifiants provisoires pour ce qui n'existe pas encore, et cet écart
// entre l'arbre chargé et l'arbre courant devient une liste d'écritures.
//
// Un champ créé puis modifié dans la même séance ne donne qu'une insertion,
// avec sa valeur finale ; créé puis supprimé, il ne donne rien du tout.
// ──────────────────────────────────────────────────────────────────────────

const TEMP_PREFIX = "tmp-";

/** Un identifiant qui n'existe qu'ici, le temps d'arriver en base. */
export function tempId(): string {
  return `${TEMP_PREFIX}${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

export type SectionInsert = { tempId: string; name: string; position: number };
export type SectionUpdate = { id: string; patch: { name?: string; position?: number } };
export type FieldInsert = {
  tempId: string;
  /** L'identifiant de sa section — provisoire si elle naît en même temps. */
  sectionId: string;
  row: Record<string, unknown>;
};
export type FieldUpdate = { id: string; patch: Record<string, unknown> };

export type SectionOps = {
  deleteFields: string[];
  deleteSections: string[];
  insertSections: SectionInsert[];
  updateSections: SectionUpdate[];
  insertFields: FieldInsert[];
  updateFields: FieldUpdate[];
};

export const NO_OPS: SectionOps = {
  deleteFields: [], deleteSections: [], insertSections: [],
  updateSections: [], insertFields: [], updateFields: [],
};

export function hasOps(ops: SectionOps): boolean {
  return Object.values(ops).some((liste) => liste.length > 0);
}

/** Les colonnes d'un champ que l'éditeur écrit (`section_id` se pose à part). */
const FIELD_COLUMNS = ["type", "data", "position", "locked", "required", "template_field_id"] as const;

function fieldRow(field: PersonaSectionField): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of FIELD_COLUMNS) {
    const value = (field as unknown as Record<string, unknown>)[col];
    if (value !== undefined) row[col] = value;
  }
  return row;
}

function memeValeur(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/**
 * L'écart entre l'arbre chargé et l'arbre courant.
 *
 * Les sections et les champs sont appariés par identifiant : ce qui porte un
 * identifiant provisoire naît, ce qui a disparu de l'arbre courant meurt, le
 * reste ne s'écrit que si une colonne a bougé.
 */
export function diffSections(
  before: PersonaSectionWithFields[],
  after: PersonaSectionWithFields[],
): SectionOps {
  const ops: SectionOps = { deleteFields: [], deleteSections: [], insertSections: [], updateSections: [], insertFields: [], updateFields: [] };

  const avant = new Map(before.map((s) => [s.id, s]));
  const apres = new Map(after.map((s) => [s.id, s]));
  // Les champs de l'arbre chargé, toutes sections confondues : un champ
  // déplacé doit se retrouver, où qu'il soit passé.
  const champsAvant = new Map(
    before.flatMap((s) => s.fields.map((f) => [f.id, { field: f, sectionId: s.id }] as const)),
  );
  const restants = new Set(champsAvant.keys());

  // Sections disparues : la base efface leurs champs en cascade, inutile de
  // les lister un à un.
  for (const s of before) {
    if (apres.has(s.id)) continue;
    ops.deleteSections.push(s.id);
    for (const f of s.fields) restants.delete(f.id);
  }

  for (const [index, section] of after.entries()) {
    const position = section.position ?? index * 10;
    const ancienne = avant.get(section.id);

    if (!ancienne) {
      ops.insertSections.push({ tempId: section.id, name: section.name, position });
    } else {
      const patch: SectionUpdate["patch"] = {};
      if (ancienne.name !== section.name) patch.name = section.name;
      if (ancienne.position !== position) patch.position = position;
      if (Object.keys(patch).length > 0) ops.updateSections.push({ id: section.id, patch });
    }

    for (const field of section.fields) {
      const ancien = champsAvant.get(field.id);
      if (!ancien) {
        ops.insertFields.push({ tempId: field.id, sectionId: section.id, row: fieldRow(field) });
        continue;
      }
      const row = fieldRow(field);
      const patch: Record<string, unknown> = {};
      for (const [col, valeur] of Object.entries(row)) {
        if (!memeValeur((ancien.field as unknown as Record<string, unknown>)[col], valeur)) patch[col] = valeur;
      }
      // Un champ passé d'un onglet à l'autre change de section, il ne renaît pas.
      if (ancien.sectionId !== section.id) patch.section_id = section.id;
      if (Object.keys(patch).length > 0) ops.updateFields.push({ id: field.id, patch });
      restants.delete(field.id);
    }
  }

  // Ce qui n'a été retrouvé nulle part a bien disparu.
  ops.deleteFields = [...restants];
  return ops;
}

// ──────────────────────────────────────────────────────────────────────────
// L'écriture
// ──────────────────────────────────────────────────────────────────────────

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Écrit la fiche et l'écart de ses onglets en UNE requête (migration 223) :
 * `save_persona_sheet` applique tout dans une transaction, dans l'ordre qui
 * tient (effacer, créer les onglets, modifier, créer et modifier les champs),
 * résout les identifiants provisoires, et vérifie que chaque écriture a porté.
 * Une écriture refusée annule l'ensemble — jamais de fiche à moitié écrite.
 *
 * Avant, une requête par onglet ou champ touché partait l'une après l'autre,
 * et un refus de la RLS (qui ne lève pas d'erreur) passait inaperçu.
 */
export async function savePersonaSheet(
  supabase: RpcClient,
  personaId: string,
  patch: Record<string, unknown>,
  ops: SectionOps,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("save_persona_sheet", {
    p_persona_id: personaId,
    p_patch: patch,
    p_ops: ops,
  });
  return { error: error?.message ?? null };
}
