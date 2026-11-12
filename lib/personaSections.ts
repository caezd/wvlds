// Récupération des sections d'un persona avec leurs champs, regroupées.
// Partagée entre les pages serveur (app/(protected)/p, app/(protected)/w/[id])
// et les composants client (PersonaCreateSheet, WorldPersonaTemplateSection) —
// le client Supabase (navigateur ou serveur) est passé en paramètre.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    PersonaSection,
    PersonaSectionField,
    PersonaSectionWithFields,
} from "@/types/personas";

/** Colonnes d'un champ de section, telles que l'éditeur de fiche les attend. */
export const SECTION_FIELD_COLUMNS = "id, section_id, type, position, data, locked, required, template_field_id";

/**
 * Sections avec leurs champs JOINTS (`persona_section_fields`, clé étrangère
 * `section_id`), à placer dans un `select` : sections et champs arrivent en
 * une seule requête au lieu de deux successives.
 */
export const EMBEDDED_SECTIONS_COLUMNS = `id, persona_id, name, position, persona_section_fields(${SECTION_FIELD_COLUMNS})`;

type EmbeddedSection = PersonaSection & { persona_section_fields?: PersonaSectionField[] | null };

const parPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/**
 * Remet en forme des sections lues avec `EMBEDDED_SECTIONS_COLUMNS` : champs
 * renommés en `fields`, sections et champs triés par position (PostgREST ne
 * garantit pas l'ordre des lignes jointes sans `order` sur la relation).
 */
export function normalizeEmbeddedSections(raw: unknown): PersonaSectionWithFields[] {
    return ((raw ?? []) as EmbeddedSection[])
        .map(({ persona_section_fields, ...section }) => ({
            ...section,
            fields: [...(persona_section_fields ?? [])].sort(parPosition),
        }))
        .sort(parPosition);
}

/** Sections + champs de plusieurs personas, indexées par persona_id. */
export async function fetchSectionsByPersona(
    supabase: SupabaseClient,
    personaIds: string[],
): Promise<Map<string, PersonaSectionWithFields[]>> {
    const sectionsByPersona = new Map<string, PersonaSectionWithFields[]>();
    for (const pid of personaIds) sectionsByPersona.set(pid, []);
    if (personaIds.length === 0) return sectionsByPersona;

    // Une seule requête : les champs sont joints à leurs sections.
    const { data: embedded, error } = await supabase
        .from("persona_sections")
        .select(EMBEDDED_SECTIONS_COLUMNS)
        .in("persona_id", personaIds)
        .order("position", { ascending: true });

    if (!error) {
        for (const s of normalizeEmbeddedSections(embedded)) {
            sectionsByPersona.get(s.persona_id)?.push(s);
        }
        return sectionsByPersona;
    }

    // Repli : jointure refusée (relation absente du cache de schéma
    // PostgREST, par exemple) — sections puis champs, en deux temps.
    console.error("[fetchSectionsByPersona] jointure refusée : %s", error.message);
    const { data: sections } = await supabase
        .from("persona_sections")
        .select("id, persona_id, name, position")
        .in("persona_id", personaIds)
        .order("position", { ascending: true });

    const sectionsList = (sections ?? []) as PersonaSection[];
    const sectionIds = sectionsList.map((s) => s.id);
    let fieldsList: PersonaSectionField[] = [];

    if (sectionIds.length > 0) {
        const { data: fields } = await supabase
            .from("persona_section_fields")
            .select(SECTION_FIELD_COLUMNS)
            .in("section_id", sectionIds)
            .order("position", { ascending: true });
        fieldsList = (fields ?? []) as PersonaSectionField[];
    }

    const fieldsBySection = new Map<string, PersonaSectionField[]>();
    for (const f of fieldsList) {
        const arr = fieldsBySection.get(f.section_id);
        if (arr) arr.push(f);
        else fieldsBySection.set(f.section_id, [f]);
    }

    for (const s of sectionsList) {
        const entry: PersonaSectionWithFields = {
            ...s,
            fields: fieldsBySection.get(s.id) ?? [],
        };
        sectionsByPersona.get(s.persona_id)?.push(entry);
    }
    return sectionsByPersona;
}

/** Sections + champs d'un seul persona. */
export async function fetchPersonaSections(
    supabase: SupabaseClient,
    personaId: string,
): Promise<PersonaSectionWithFields[]> {
    const map = await fetchSectionsByPersona(supabase, [personaId]);
    return map.get(personaId) ?? [];
}
