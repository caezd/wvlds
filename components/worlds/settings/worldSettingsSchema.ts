import { z } from "zod";

import { httpUrlSchema, INPUT_LIMITS } from "@/lib/inputSchemas";

// Schéma du formulaire des réglages d'un monde. Séparé du composant pour être
// vérifiable sans monter d'interface — voir `__tests__/worldSettingsSchema.test.ts`.
//
// Les URL passent par `httpUrlSchema` et non `z.url()` : ce dernier accepte
// tout ce que `new URL()` sait lire, `javascript:` compris. La borne de `name`
// est celle de la base — sans elle, un nom trop long échouait en message
// Postgres brut plutôt qu'en erreur de formulaire.

/** Traducteur du namespace `worlds.settings` — ou l'identité, dans les tests. */
export type SchemaTranslator = (key: "nameMin" | "maxChars" | "colorInvalid", values?: Record<string, number>) => string;

export const WORLD_NAME_MIN = 2;
export const WORLD_DESCRIPTION_MAX = 1000;
export const WIKI_LABEL_MAX = 40;

/** Les messages d'erreur sont traduits : le schéma se construit avec `t`. */
export function buildWorldSettingsSchema(t: SchemaTranslator) {
    return z.object({
        name: z
            .string()
            .min(WORLD_NAME_MIN, t("nameMin", { min: WORLD_NAME_MIN }))
            .max(INPUT_LIMITS.shortText, t("maxChars", { max: INPUT_LIMITS.shortText })),
        description: z
            .string()
            .max(WORLD_DESCRIPTION_MAX, t("maxChars", { max: WORLD_DESCRIPTION_MAX }))
            .optional()
            .or(z.literal("")),
        icon_url: httpUrlSchema.optional().or(z.literal("")),
        banner_url: httpUrlSchema.optional().or(z.literal("")),
        color: z
            .string()
            .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, t("colorInvalid"))
            .optional()
            .or(z.literal("")),
        visibility: z.enum(["private", "public"]),
        wiki_label: z
            .string()
            .trim()
            .max(WIKI_LABEL_MAX, t("maxChars", { max: WIKI_LABEL_MAX }))
            .optional()
            .or(z.literal("")),
    });
}

export type WorldFormValues = z.infer<ReturnType<typeof buildWorldSettingsSchema>>;

/**
 * Rend `null` pour une chaîne vide ou blanche, la chaîne élaguée sinon.
 *
 * Les champs facultatifs du formulaire arrivent en `""` et non en `undefined` ;
 * les enregistrer tels quels remplirait la base de chaînes vides au lieu de
 * marquer l'absence.
 */
export function truthyOrNull<T extends string | undefined | null>(
    v: T
): string | null {
    if (!v) return null;
    const s = String(v).trim();
    return s.length ? s : null;
}

/** Champs du monde que l'écran de réglages enregistre à la volée. */
export type ChampPersistable =
  | "name"
  | "description"
  | "icon_url"
  | "banner_url"
  | "color"
  | "visibility"
  | "wiki_label"
  | "home_body_color"
  | "home_panel_color";

/** Enregistre un champ dès sa modification, sans bouton « valider ». */
export type PersistField = (champ: ChampPersistable, valeur: string | null) => Promise<void>;
