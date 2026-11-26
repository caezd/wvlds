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
import { permissionListOpensSettings } from "@/lib/worldPermissions";

export type WorldPanel =
  | "settings"
  | "personas"
  | "canvas"
  | "wiki"
  | "map"
  | "timeline"
  | "shops"
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
  /** Drapeau `world_economy` ET `worldHasShops` (économie, inventaire, option Boutiques). */
  hasShops: boolean;
  /**
   * Les permissions du membre, `administrator` compris (le propriétaire ne
   * porte que celle-là) : elles décident de l'accès aux réglages.
   */
  permissions: readonly string[];
};

export function resolveWorldPanel(view: string | null | undefined, ctx: WorldPanelContext): WorldPanel {
  switch (view) {
    case "settings":
      return permissionListOpensSettings(ctx.permissions) ? "settings" : "home";
    case "personas":
    case "canvas":
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
    case "shops":
      return ctx.hasShops ? "shops" : "home";
    // `catalogue` (Objets) et `skills` (Compétences) ne sont plus des vues :
    // ils se gèrent dans les réglages (Économie › Inventaire, Personas ›
    // Compétences). Un ancien lien retombe ici.
    default:
      return "home";
  }
}
