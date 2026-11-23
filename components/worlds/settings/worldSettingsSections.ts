/**
 * Le menu des paramètres d'un monde : ses sections, rangées en groupes.
 *
 * Chaque section répond à une permission (calculée par WorldSettingsView) ;
 * celles qu'on ne peut pas ouvrir disparaissent du menu, et un groupe vidé
 * disparaît avec elles. La section ouverte vit dans l'adresse
 * (`?view=settings&section=map`) : lien direct, bouton Précédent.
 */

/** Les sous-pages de l'ancien onglet « Fonctions ». */
export const FEATURE_SECTIONS = ["catalogue", "map", "wiki", "personas", "timeline", "chatbox"] as const;
export type FeatureSectionId = (typeof FEATURE_SECTIONS)[number];

export const SETTINGS_GROUPS = [
  { id: "world", sections: ["general", "home", "community"] },
  { id: "features", sections: FEATURE_SECTIONS },
  { id: "rooms", sections: ["categories", "groups", "relations"] },
  { id: "members", sections: ["roles", "announcements", "reports"] },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];
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
  return isSettingsSection(param) && allowed(param) ? param : null;
}

/** L'adresse courante avec cette section (ou sans section). */
export function urlWithSection(href: string, section: SettingsSectionId | null): string {
  const url = new URL(href);
  if (section) url.searchParams.set(SECTION_PARAM, section);
  else url.searchParams.delete(SECTION_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
