export type MessageFont = "sans" | "serif" | "dyslexic";
export type MessageTextSize = "sm" | "base" | "lg";
export type MessageTextAlign = "left" | "justify";

export function asMessageFont(value: string | null | undefined): MessageFont {
  return value === "serif" || value === "dyslexic" ? value : "sans";
}

export function asMessageTextSize(value: string | null | undefined): MessageTextSize {
  return value === "sm" || value === "lg" ? value : "base";
}

export function asMessageTextAlign(value: string | null | undefined): MessageTextAlign {
  return value === "justify" ? "justify" : "left";
}
