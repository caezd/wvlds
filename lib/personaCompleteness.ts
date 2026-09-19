// Miroir TypeScript de `persona_field_has_value` et de la complétude d'une
// fiche (migration 181). La base tient `personas.sheet_complete` à jour par
// déclencheur ; ce module sert à l'éditeur, qui doit dire au joueur ce qui
// manque avant même que la fiche ne soit relue — sans aller-retour.

import type { PersonaFieldData, PersonaFieldType, PersonaSectionWithFields } from "@/types/personas";

/** Les clés de tableau par type, telles que `SectionFieldsEditor` les écrit. */
const ARRAY_KEYS: Partial<Record<PersonaFieldType, keyof PersonaFieldData>> = {
  stats: "items",
  "image-grid": "images",
  inventory: "inventoryItems",
  skills: "skillItems",
  gauges: "gaugeItems",
  traits: "traitItems",
  timeline: "timelineItems",
  dl: "dlItems",
};

/** Un champ porte-t-il une valeur ? Titre et séparateur comptent toujours. */
export function fieldHasValue(type: PersonaFieldType | string, data: PersonaFieldData | null | undefined): boolean {
  switch (type) {
    case "title":
    case "separator":
      return true;
    case "text":
    case "input":
    case "textarea":
      return typeof data?.text === "string" && data.text.trim() !== "";
    case "quote":
      return typeof data?.quoteText === "string" && data.quoteText.trim() !== "";
    default: {
      const key = ARRAY_KEYS[type as PersonaFieldType];
      if (!key) return true;
      const value = data?.[key];
      return Array.isArray(value) && value.length > 0;
    }
  }
}

export type TemplateRequiredField = {
  id: string;
  type: PersonaFieldType | string;
  sectionName: string;
  /** Son `label`, sinon le texte du dernier titre qui le précède dans la section — ce que le joueur voit. */
  label: string | null;
};

export type MissingRequiredField = TemplateRequiredField & {
  /** Le champ de la fiche lié au modèle, s'il existe ; absent = à ajouter par synchronisation. */
  fieldId: string | null;
  sectionId: string | null;
};

/**
 * Les champs obligatoires du modèle qui manquent sur une fiche : sans champ
 * lié, ou lié mais vide. Même règle que `persona_sheet_is_complete`.
 */
export function missingRequiredFields(
  sections: PersonaSectionWithFields[],
  required: TemplateRequiredField[],
): MissingRequiredField[] {
  const linked = new Map<string, { fieldId: string; sectionId: string; filled: boolean }>();
  for (const section of sections) {
    for (const field of section.fields) {
      if (!field.template_field_id) continue;
      const filled = fieldHasValue(field.type, field.data);
      const prev = linked.get(field.template_field_id);
      // Plusieurs copies du même champ : une seule remplie suffit.
      if (!prev || (filled && !prev.filled)) {
        linked.set(field.template_field_id, { fieldId: field.id, sectionId: section.id, filled });
      }
    }
  }
  return required.flatMap((tf) => {
    const match = linked.get(tf.id);
    if (match?.filled) return [];
    return [{ ...tf, fieldId: match?.fieldId ?? null, sectionId: match?.sectionId ?? null }];
  });
}

/** Les champs obligatoires d'un modèle (ses sections, avec `required`). */
export function templateRequiredFields(templateSections: PersonaSectionWithFields[]): TemplateRequiredField[] {
  const out: TemplateRequiredField[] = [];
  for (const s of templateSections) {
    let heading: string | null = null;
    for (const f of [...s.fields].sort((a, b) => a.position - b.position)) {
      if (f.type === "title") {
        const text = typeof f.data?.text === "string" ? f.data.text.trim() : "";
        heading = text || null;
        continue;
      }
      if (!f.required) continue;
      const own = (f as { label?: string | null }).label?.trim();
      out.push({ id: f.id, type: f.type, sectionName: s.name, label: own || heading });
    }
  }
  return out;
}
