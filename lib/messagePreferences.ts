export type MessageFont = "sans" | "serif" | "dyslexic";
export type MessageTextSize = "sm" | "base" | "lg";
export type MessageTextAlign = "left" | "justify";
/** L'en-tête des messages qui suivent celui d'un même persona. */
export type MessageHeaderMode = "subtle" | "hidden";

export function asMessageFont(value: string | null | undefined): MessageFont {
  return value === "serif" || value === "dyslexic" ? value : "sans";
}

export function asMessageTextSize(value: string | null | undefined): MessageTextSize {
  return value === "sm" || value === "lg" ? value : "base";
}

export function asMessageTextAlign(value: string | null | undefined): MessageTextAlign {
  return value === "justify" ? "justify" : "left";
}

export function asMessageHeaderMode(value: string | null | undefined): MessageHeaderMode {
  return value === "hidden" ? "hidden" : "subtle";
}
