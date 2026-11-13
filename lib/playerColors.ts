/**
 * La palette proposée partout où un joueur choisit une couleur : rôles,
 * groupes, arcs, régions, épingles, jauges, encadrés, bulles de dialogue.
 * Ce sont les douze teintes `--color-chain-*` de app/globals.css,
 * rangées sur le cercle chromatique ; les couleurs s’enregistrent en hexadécimal.
 */
export const PLAYER_COLORS = [
  "#FB7185", // rose
  "#FF6B9D", // rose vif
  "#FF8C42", // orange
  "#FBBF24", // ambre
  "#FFDD57", // or
  "#A3E635", // citron vert
  "#70F4B6", // menthe
  "#2DD4BF", // sarcelle
  "#22D3EE", // cyan
  "#60A5FA", // bleu
  "#818CF8", // indigo
  "#C084FC", // violet
] as const;

/** La couleur par défaut de tous les sélecteurs : indigo. */
export const DEFAULT_PLAYER_COLOR = "#818CF8";
