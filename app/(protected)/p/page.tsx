// app/(protected)/personas/page.tsx
import { createClient } from "@/lib/supabase/server";
import { PersonaEditSheet } from "@/components/personas/PersonaEditSheet";
import type {
  PersonaSection,
  PersonaSectionField,
  PersonaSectionWithFields,
} from "@/types/personas";

type PersonaRow = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  avatar_config?: any | null;
};

export default async function PersonasPage() {
  const supabase = await createClient();

  // 1) Personas (avec fallback si colonnes manquantes)
  let personaList: PersonaRow[] = [];
  {
    const withAvatar = await supabase
      .from("personas")
      .select("id, name, avatar_url, avatar_config")
      .order("name", { ascending: true });

    if (!withAvatar.error) {
      personaList = (withAvatar.data ?? []) as PersonaRow[];
    } else {
      const basic = await supabase
        .from("personas")
        .select("id, name")
        .order("name", { ascending: true });

      if (basic.error) {
        console.error("PersonasPage personasError", basic.error);
      }
      personaList = (basic.data ?? []) as PersonaRow[];
    }
  }

  const personaIds = personaList.map((p) => p.id);

  const sectionsByPersona = new Map<string, PersonaSectionWithFields[]>();

  if (personaIds.length > 0) {
    // 2) Sections
    const { data: sections, error: sectionsError } = await supabase
      .from("persona_sections")
      .select("id, persona_id, name, position")
      .in("persona_id", personaIds)
      .order("position", { ascending: true });

    if (sectionsError)
      console.error("PersonasPage sectionsError", sectionsError);

    const sectionsList = (sections ?? []) as PersonaSection[];
    const sectionIds = sectionsList.map((s) => s.id);

    // 3) Fields
    let fieldsList: PersonaSectionField[] = [];
    if (sectionIds.length > 0) {
      const { data: fields, error: fieldsError } = await supabase
        .from("persona_section_fields")
        .select("id, section_id, type, position, data")
        .in("section_id", sectionIds)
        .order("position", { ascending: true });

      if (fieldsError) console.error("PersonasPage fieldsError", fieldsError);
      fieldsList = (fields ?? []) as PersonaSectionField[];
    }

    const fieldsBySection = new Map<string, PersonaSectionField[]>();
    for (const f of fieldsList) {
      const arr = fieldsBySection.get(f.section_id);
      if (arr) arr.push(f);
      else fieldsBySection.set(f.section_id, [f]);
    }

    for (const pid of personaIds) sectionsByPersona.set(pid, []);

    for (const s of sectionsList) {
      const sectionWithFields: PersonaSectionWithFields = {
        ...s,
        fields: fieldsBySection.get(s.id) ?? [],
      };

      const arr = sectionsByPersona.get(s.persona_id);
      if (arr) arr.push(sectionWithFields);
      else sectionsByPersona.set(s.persona_id, [sectionWithFields]);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personnages</h1>
      </header>

      <div className="space-y-2">
        {personaList.map((persona) => (
          <div
            key={persona.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div>
              <div className="font-medium">{persona.name || "Sans nom"}</div>
              <div className="text-xs text-muted-foreground">{persona.id}</div>
            </div>

            <PersonaEditSheet
              personaId={persona.id}
              personaName={persona.name ?? "Sans nom"}
              initialSections={sectionsByPersona.get(persona.id) ?? []}
              initialAvatarUrl={persona.avatar_url ?? null}
              initialAvatarConfig={(persona as any).avatar_config ?? null}
            />
          </div>
        ))}

        {personaList.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun personnage pour le moment.
          </p>
        )}
      </div>
    </div>
  );
}
