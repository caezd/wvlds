import { z } from "zod";

// Schéma du formulaire des réglages d'un monde. Séparé du composant pour être
// vérifiable sans monter d'interface — voir `__tests__/worldSettingsSchema.test.ts`.

export const worldSettingsSchema = z.object({
    name: z.string().min(2, "Au moins 2 caractères"),
    description: z
        .string()
        .max(1000, "1000 caractères max")
        .optional()
        .or(z.literal("")),
    icon_url: z.string().url("URL invalide").optional().or(z.literal("")),
    banner_url: z.string().url("URL invalide").optional().or(z.literal("")),
    color: z
        .string()
        .regex(
            /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
            "Couleur hex valide, p.ex. #1f2937"
        )
        .optional()
        .or(z.literal("")),
    visibility: z.enum(["private", "public"]),
    wiki_label: z.string().trim().max(40, "40 caractères max").optional().or(z.literal("")),
});

export type WorldFormValues = z.infer<typeof worldSettingsSchema>;

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
