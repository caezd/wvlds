export type WikiTemplateId = "character" | "location" | "faction" | "event";

export const WIKI_TEMPLATE_IDS: WikiTemplateId[] = ["character", "location", "faction", "event"];

/** Icône Lucide (kebab-case) associée à chaque modèle de page. Libellé et
 *  contenu de départ vivent dans messages/*.json (namespace wiki.templates). */
export const WIKI_TEMPLATE_ICONS: Record<WikiTemplateId, string> = {
  character: "user-round",
  location: "map-pin",
  faction: "shield",
  event: "calendar-clock",
};
