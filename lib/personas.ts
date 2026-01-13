// lib/personas.ts
import { createClient } from "@/lib/supabase/server";
import type { PersonaSectionWithFields } from "@/types/personas";

export async function getPersonaSectionsWithFields(personaId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("persona_sections")
    .select(
      `
      id,
      persona_id,
      name,
      position,
      fields:persona_section_fields (
        id,
        section_id,
        type,
        label,
        position,
        data
      )
    `,
    )
    .eq("persona_id", personaId)
    .order("position", { ascending: true })
    .order("position", {
      foreignTable: "persona_section_fields",
      ascending: true,
    });

  if (error) {
    console.error("getPersonaSectionsWithFields error", error);
    throw error;
  }

  // data est déjà dans la bonne forme (sections + fields)
  return data as PersonaSectionWithFields[];
}

export async function getPersona(personaId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("personas")
    .select("*")
    .eq("id", personaId)
    .single();
  if (error) {
    console.error("getPersona error", error);
    throw error;
  }
  return data;
}
