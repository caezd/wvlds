"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

// Picker + données de locale FR chargés uniquement côté client et de façon
// paresseuse (le bundle n'est tiré qu'à l'ouverture du picker).
const ChatReactionPickerInner = dynamic(
  () => import("./ChatReactionPickerInner"),
  { ssr: false },
);

/**
 * Variables CSS de emoji-picker-react (préfixe `--epr-`) mappées sur les tokens
 * de thème de l'app, pour que le picker épouse les couleurs/le style des
 * dropdowns (popover) de wvlds.
 */
const eprThemeVars = {
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

export function ChatReactionPicker({
  onSelect,
}: {
  onSelect: (unified: string) => void;
}) {
  return (
    <div style={eprThemeVars}>
      <ChatReactionPickerInner onSelect={onSelect} />
    </div>
  );
}
