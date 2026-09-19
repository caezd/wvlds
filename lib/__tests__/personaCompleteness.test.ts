import { describe, it, expect } from "vitest";

import { fieldHasValue, missingRequiredFields, templateRequiredFields } from "@/lib/personaCompleteness";
import { personaReviewLock, reviewStatusOf, sheetBadgeOf } from "@/lib/personaReview";
import type { PersonaSectionWithFields } from "@/types/personas";

describe("fieldHasValue — miroir de persona_field_has_value", () => {
  it("juge le texte sur data.text, la citation sur quoteText, les autres sur leur tableau", () => {
    expect(fieldHasValue("text", { text: "  " })).toBe(false);
    expect(fieldHasValue("text", { text: "Bonjour" })).toBe(true);
    expect(fieldHasValue("input", {})).toBe(false);
    expect(fieldHasValue("quote", { quoteText: "", quoteSource: "x" })).toBe(false);
    expect(fieldHasValue("quote", { quoteText: "Ainsi" })).toBe(true);
    expect(fieldHasValue("stats", { items: [] })).toBe(false);
    expect(fieldHasValue("stats", { items: [{ id: "1", label: "Force", value: "3" }] })).toBe(true);
    expect(fieldHasValue("image-grid", { images: [{ id: "a", url: "u" }] })).toBe(true);
    expect(fieldHasValue("dl", null)).toBe(false);
  });

  it("le titre et le séparateur comptent toujours, comme un type inconnu", () => {
    expect(fieldHasValue("title", { text: "" })).toBe(true);
    expect(fieldHasValue("separator", {})).toBe(true);
    expect(fieldHasValue("mystery", null)).toBe(true);
  });
});

const TEMPLATE: PersonaSectionWithFields[] = [
  {
    id: "ts1", persona_id: "t", name: "Identité", position: 0,
    fields: [
      { id: "tf-title", section_id: "ts1", type: "title", position: 0, data: { text: "Identité" }, locked: true, required: false },
      { id: "tf-bio", section_id: "ts1", type: "text", position: 1, data: { text: "" }, locked: true, required: true },
      { id: "tf-stats", section_id: "ts1", type: "stats", position: 2, data: { items: [] }, locked: true, required: true },
    ],
  },
];

describe("missingRequiredFields", () => {
  const required = templateRequiredFields(TEMPLATE);

  it("liste les champs obligatoires du modèle, nommés par le titre qui les précède", () => {
    expect(required.map((f) => f.id)).toEqual(["tf-bio", "tf-stats"]);
    expect(required[0].sectionName).toBe("Identité");
    expect(required.map((f) => f.label)).toEqual(["Identité", "Identité"]);
  });

  it("distingue le champ vide (lié) du champ absent (à synchroniser)", () => {
    const sheet: PersonaSectionWithFields[] = [
      {
        id: "s1", persona_id: "p", name: "Identité", position: 0,
        fields: [{ id: "f-bio", section_id: "s1", type: "text", position: 0, data: { text: "" }, template_field_id: "tf-bio" }],
      },
    ];
    const missing = missingRequiredFields(sheet, required);
    expect(missing.map((m) => [m.id, m.fieldId])).toEqual([["tf-bio", "f-bio"], ["tf-stats", null]]);
  });

  it("une seule copie remplie suffit ; la fiche complète ne manque de rien", () => {
    const sheet: PersonaSectionWithFields[] = [
      {
        id: "s1", persona_id: "p", name: "Identité", position: 0,
        fields: [
          { id: "f-bio-empty", section_id: "s1", type: "text", position: 0, data: { text: "" }, template_field_id: "tf-bio" },
          { id: "f-bio", section_id: "s1", type: "text", position: 1, data: { text: "Né à Lyon" }, template_field_id: "tf-bio" },
          { id: "f-stats", section_id: "s1", type: "stats", position: 2, data: { items: [{ id: "1", label: "F", value: "1" }] }, template_field_id: "tf-stats" },
        ],
      },
    ];
    expect(missingRequiredFields(sheet, required)).toEqual([]);
  });
});

describe("lib/personaReview", () => {
  it("une valeur inconnue vaut « validée » (les anciens appelants ne chargent pas la colonne)", () => {
    expect(reviewStatusOf("draft")).toBe("draft");
    expect(reviewStatusOf("submitted")).toBe("submitted");
    expect(reviewStatusOf(undefined)).toBe("approved");
    expect(reviewStatusOf("zombie")).toBe("approved");
  });

  it("le badge : incomplète d'abord, puis l'état de relecture, rien pour une fiche validée", () => {
    expect(sheetBadgeOf({ review_status: "draft", sheet_complete: false })).toBe("incomplete");
    expect(sheetBadgeOf({ review_status: "draft", sheet_complete: true })).toBe("draft");
    expect(sheetBadgeOf({ review_status: "submitted" })).toBe("submitted");
    expect(sheetBadgeOf({ review_status: "approved", sheet_complete: true })).toBeNull();
    expect(sheetBadgeOf({})).toBeNull();
  });

  it("le verrou de jeu suit la même règle", () => {
    expect(personaReviewLock({ review_status: "approved", sheet_complete: false })).toBe("incomplete");
    expect(personaReviewLock({ review_status: "submitted", sheet_complete: true })).toBe("unreviewed");
    expect(personaReviewLock({ review_status: "approved", sheet_complete: true })).toBeNull();
  });
});
