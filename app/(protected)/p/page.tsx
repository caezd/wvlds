// app/(protected)/personas/page.tsx
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PersonaCard } from "@/components/personas/PersonaCard";
import { PersonaCreateSheet } from "@/components/personas/PersonaCreateSheet";
import type {
  PersonaSection,
  PersonaSectionField,
  PersonaSectionWithFields,
} from "@/types/personas";
import type { AvatarConfigV1 } from "@/components/personas/avatar/PersonaAvatarPicker";

type PersonaRow = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  avatar_config?: unknown;
  avatar_frame_id?: string | null;
  banner_url?: string | null;
};

export default async function PersonasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // 1) Personas de l'utilisateur connecté uniquement
  let personaList: PersonaRow[] = [];
  {
    const withAvatar = await supabase
      .from("personas")
      .select("id, name, avatar_url, avatar_config, banner_url, avatar_frame_id")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (!withAvatar.error) {
      personaList = (withAvatar.data ?? []) as PersonaRow[];
    } else {
      const basic = await supabase
        .from("personas")
        .select("id, name")
        .eq("user_id", userId)
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

    if (sectionsError) {
      // PostgrestError properties are non-enumerable — log message explicitly
      console.error(
        "PersonasPage sectionsError:",
        sectionsError.message ?? sectionsError.code ?? JSON.stringify(sectionsError),
      );
    }

    const sectionsList = (sections ?? []) as PersonaSection[];
    const sectionIds = sectionsList.map((s) => s.id);

    // 3) Fields — skip entirely if sections table didn't exist
    let fieldsList: PersonaSectionField[] = [];
    if (!sectionsError && sectionIds.length > 0) {
      const { data: fields, error: fieldsError } = await supabase
        .from("persona_section_fields")
        .select("id, section_id, type, position, data")
        .in("section_id", sectionIds)
        .order("position", { ascending: true });

      if (fieldsError) {
        console.error(
          "PersonasPage fieldsError:",
          fieldsError.message ?? fieldsError.code ?? JSON.stringify(fieldsError),
        );
      }
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
    <div className="p-6 space-y-6 max-w-6xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{personaList.length} persona{personaList.length !== 1 ? "s" : ""}</p>
          <PersonaCreateSheet />
        </div>
      </header>

      {personaList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3 rounded-2xl border border-dashed border-border">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucun persona pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {personaList.map((persona) => (
            <PersonaCard
              key={persona.id}
              personaId={persona.id}
              personaName={persona.name ?? "Sans nom"}
              avatarUrl={persona.avatar_url}
              avatarConfig={persona.avatar_config as AvatarConfigV1 | null}
              bannerUrl={persona.banner_url}
              initialFrameId={persona.avatar_frame_id ?? null}
              initialSections={sectionsByPersona.get(persona.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
