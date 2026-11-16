import type { CSSProperties } from "react";

import { parseHexColor } from "@/components/ui/hsv-color-picker";

/**
 * Fond des pages (`--background`, #18181B) : l'application n'a qu'un thème
 * sombre. Une couleur semi-transparente se lit mélangée à lui.
 */
const PAGE_BACKGROUND = { r: 0x18, g: 0x18, b: 0x1b };

/** Luminance relative WCAG d'une couleur sRGB (0 à 255 par canal). */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Couleur du texte posé sur `background` : noir sur un fond clair, blanc sur
 * un fond sombre — celle des deux qui contraste le plus (WCAG). `undefined`
 * si la couleur n'est pas un hexadécimal lisible : le texte garde la sienne.
 */
export function readableTextOn(background: string): string | undefined {
  const c = parseHexColor(background);
  if (!c) return undefined;
  const mix = (ch: "r" | "g" | "b") => c[ch] * c.a + PAGE_BACKGROUND[ch] * (1 - c.a);
  const l = luminance({ r: mix("r"), g: mix("g"), b: mix("b") });
  // Contraste avec le noir : (l + .05) / .05 ; avec le blanc : 1.05 / (l + .05).
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#000" : "#fff";
}

/**
 * Style d'une bulle de dialogue : la couleur choisie telle quelle (son alpha
 * compris), et un texte noir ou blanc selon ce qui se lit le mieux dessus.
 */
export function bubbleStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  const text = readableTextOn(color);
  return { backgroundColor: color, ...(text ? { color: text } : null) };
}
