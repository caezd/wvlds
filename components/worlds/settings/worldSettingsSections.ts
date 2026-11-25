/**
 * Le menu des paramètres d'un monde : ses sections, rangées en groupes.
 *
 * Chaque section répond à une permission (calculée par WorldSettingsView) ;
 * celles qu'on ne peut pas ouvrir disparaissent du menu, et un groupe vidé
 * disparaît avec elles. La section ouverte vit dans l'adresse
 * (`?view=settings&section=map`) : lien direct, bouton Précédent.
 */

/** Les sous-pages de l'ancien onglet « Fonctions ». */
export const FEATURE_SECTIONS = ["map", "wiki", "personas", "timeline", "chatbox", "currency", "items", "shops", "trades"] as const;
export type FeatureSectionId = (typeof FEATURE_SECTIONS)[number];

/**
 * Les sous-catégories d'un groupe : des sections qui se suivent, rangées sous
 * un titre à elles dans le menu. L'économie réunit devises, objets,
 * boutiques et échanges (demande du 2026-11-24) ; les gains vivent dans Devises.
 */
export const SETTINGS_SUBGROUPS = {
  economy: ["currency", "items", "shops", "trades"],
} as const satisfies Record<string, readonly FeatureSectionId[]>;
export type SettingsSubgroupId = keyof typeof SETTINGS_SUBGROUPS;

/** La sous-catégorie d'une section, ou `null`. */
export function subgroupOf(id: string): SettingsSubgroupId | null {
  for (const [sub, sections] of Object.entries(SETTINGS_SUBGROUPS)) {
    if ((sections as readonly string[]).includes(id)) return sub as SettingsSubgroupId;
  }
  return null;
}

/** Les anciennes sections, que des liens peuvent encore désigner. */
const LEGACY_SECTIONS: Record<string, SettingsSectionId> = {
  catalogue: "items",
  economy: "currency",
  gains: "currency",
};

export const SETTINGS_GROUPS = [
  // En tête du menu, sans titre de groupe.
  { id: "top", sections: ["general", "community"] },
  { id: "world", sections: ["home"] },
  { id: "features", sections: FEATURE_SECTIONS },
  { id: "rooms", sections: ["categories", "groups", "relations"] },
  // Journal (migration 254) : l'activité du monde, l'économie pour l'instant.
  { id: "members", sections: ["roles", "announcements", "reports", "activity"] },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];

/** Les groupes affichés sans titre : leurs sections, simplement listées. */
export const UNTITLED_SETTINGS_GROUPS: readonly SettingsGroupId[] = ["top"];
export type SettingsSectionId = (typeof SETTINGS_GROUPS)[number]["sections"][number];

export const SETTINGS_SECTIONS: readonly SettingsSectionId[] = SETTINGS_GROUPS.flatMap((g) => g.sections);

/** Le paramètre d'adresse qui porte la section ouverte. */
export const SECTION_PARAM = "section";

export function isFeatureSection(id: string | null | undefined): id is FeatureSectionId {
  return !!id && (FEATURE_SECTIONS as readonly string[]).includes(id);
}

export function isSettingsSection(id: string | null | undefined): id is SettingsSectionId {
  return !!id && (SETTINGS_SECTIONS as readonly string[]).includes(id);
}

/**
 * Les groupes à montrer, chacun réduit aux sections permises ; les groupes
 * vides sont retirés.
 */
export function visibleSettingsGroups(allowed: (id: SettingsSectionId) => boolean) {
  return SETTINGS_GROUPS.map((g) => ({
    id: g.id as SettingsGroupId,
    sections: (g.sections as readonly SettingsSectionId[]).filter(allowed),
  })).filter((g) => g.sections.length > 0);
}

/**
 * La section demandée par l'adresse si elle existe et est permise ; sinon
 * `null` (sur mobile, c'est alors le menu qui s'affiche).
 */
export function requestedSection(
  param: string | null | undefined,
  allowed: (id: SettingsSectionId) => boolean,
): SettingsSectionId | null {
  const id = (param && LEGACY_SECTIONS[param]) ?? param;
  return isSettingsSection(id) && allowed(id) ? id : null;
}

/** L'adresse courante avec cette section (ou sans section). */
export function urlWithSection(href: string, section: SettingsSectionId | null): string {
  const url = new URL(href);
  if (section) url.searchParams.set(SECTION_PARAM, section);
  else url.searchParams.delete(SECTION_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
