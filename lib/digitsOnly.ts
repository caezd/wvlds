import type { ClipboardEvent, KeyboardEvent } from "react";

/**
 * Une case numérique qui n'accepte que des chiffres : `type="number"` laisse
 * passer « e », les signes et les séparateurs. À étaler sur l'`<input>`
 * (`{...digitsOnly}`). Raccourcis (Ctrl/⌘) et touches d'édition passent.
 */
export const digitsOnly = {
  onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (!/\d/.test(e.key)) e.preventDefault();
  },
  onPaste(e: ClipboardEvent<HTMLInputElement>) {
    if (!/^\d*$/.test(e.clipboardData.getData("text").trim())) e.preventDefault();
  },
};
