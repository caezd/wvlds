import type { CSSProperties } from "react";

/**
 * Variables CSS d'`emoji-picker-react`, mappées sur les jetons du thème.
 *
 * Bloc recopié à l'identique dans les deux points d'entrée du sélecteur
 * (réactions d'un message, bouton du composer) : un jeton renommé d'un seul
 * côté aurait laissé l'autre sélecteur avec des couleurs orphelines, visibles
 * seulement dans l'un des deux contextes.
 *
 * Le cast est celui de la librairie : ses variables ne font pas partie de
 * `CSSProperties`, mais React les transmet telles quelles.
 */
export const EMOJI_PICKER_THEME_VARS = {
  "--epr-bg-color": "var(--popover)",
  "--epr-category-label-bg-color": "var(--popover)",
  "--epr-text-color": "var(--foreground)",
  "--epr-hover-bg-color": "var(--accent)",
  "--epr-focus-bg-color": "var(--accent)",
  "--epr-highlight-color": "var(--primary)",
  "--epr-picker-border-color": "var(--border)",
  "--epr-search-border-color": "var(--border)",
  "--epr-search-input-bg-color": "var(--input)",
  "--epr-search-input-bg-color-active": "var(--input)",
  "--epr-search-input-text-color": "var(--foreground)",
  "--epr-search-input-placeholder-color": "var(--muted-foreground)",
  "--epr-category-icon-active-color": "var(--primary)",
  "--epr-active-skin-tone-indicator-border-color": "var(--primary)",
  "--epr-picker-border-radius": "var(--radius)",
} as unknown as CSSProperties;
