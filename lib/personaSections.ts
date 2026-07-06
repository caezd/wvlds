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

/** Sections + champs de plusieurs personas, indexées par persona_id. */
export async function fetchSectionsByPersona(
    supabase: SupabaseClient,
    personaIds: string[],
): Promise<Map<string, PersonaSectionWithFields[]>> {
    const sectionsByPersona = new Map<string, PersonaSectionWithFields[]>();
    for (const pid of personaIds) sectionsByPersona.set(pid, []);
    if (personaIds.length === 0) return sectionsByPersona;

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
            .select("id, section_id, type, position, data, locked")
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
