/**
 * Onglet effectivement affiché par la page d'un monde pour un `?view=` donné.
 *
 * Toute valeur absente, inconnue, ou désignant un onglet indisponible (réglage
 * du monde, drapeau global, permission) retombe sur l'accueil. Partagée entre
 * `WorldHome` (qui choisit quoi rendre) et `WorldHomeContent` (qui choisit
 * quoi charger côté serveur) : les deux doivent tomber d'accord, sinon on
 * chargerait des données pour un onglet que la page n'affiche pas — ou on
 * afficherait un accueil privé des données de ses widgets.
 */
export type WorldPanel =
  | "settings"
  | "personas"
  | "canvas"
  | "catalogue"
  | "wiki"
  | "map"
  | "timeline"
  | "members"
  | "home";

export type WorldPanelContext = {
  /** `world.enable_wiki` — colonne NOT NULL DEFAULT true. */
  enableWiki: boolean | null | undefined;
  /** `world.enable_map`. */
  enableMap: boolean | null | undefined;
  /** Drapeau global `world_map`. */
  worldMapFlag: boolean;
  /** Drapeau `world_timeline` ET chronologie activée et configurée sur le monde. */
  hasTimeline: boolean;
  canOpenSettings: boolean;
};

export function resolveWorldPanel(view: string | null | undefined, ctx: WorldPanelContext): WorldPanel {
  switch (view) {
    case "settings":
      return ctx.canOpenSettings ? "settings" : "home";
    case "personas":
    case "canvas":
    case "catalogue":
    case "members":
      return view;
    // Masquer le lien ne suffit pas : `?view=wiki` reste tapable dans la barre
    // d'adresse, et un lien partagé avant la désactivation continue de circuler.
    case "wiki":
      return ctx.enableWiki !== false ? "wiki" : "home";
    case "map":
      return ctx.enableMap !== false && ctx.worldMapFlag ? "map" : "home";
    case "timeline":
      return ctx.hasTimeline ? "timeline" : "home";
    default:
      return "home";
  }
}

/** Permissions qui ouvrent l'onglet Réglages d'un monde (cf. WorldHome). */
export const SETTINGS_PERMISSIONS = ["world.settings", "roles.manage", "categories.manage", "relations.manage"] as const;
