/**
 * Une couleur rendue plus transparente : `opacity` (0 à 1) multiplie sa propre
 * opacité. Vaut pour `#rrggbb` comme pour `#rrggbbaa` — accoler un suffixe
 * hexadécimal (`color + "33"`) casse dès que la couleur porte déjà le sien.
 */
export function withOpacity(color: string, opacity: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, opacity)) * 100);
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
