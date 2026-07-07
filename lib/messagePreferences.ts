export type MessageFont = "sans" | "serif" | "dyslexic";
export type MessageTextSize = "sm" | "base" | "lg";

export function asMessageFont(value: string | null | undefined): MessageFont {
  return value === "serif" || value === "dyslexic" ? value : "sans";
}

export function asMessageTextSize(value: string | null | undefined): MessageTextSize {
  return value === "sm" || value === "lg" ? value : "base";
}
