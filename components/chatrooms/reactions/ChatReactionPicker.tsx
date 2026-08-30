"use client";

import dynamic from "next/dynamic";
import { EMOJI_PICKER_THEME_VARS } from "./emojiPickerTheme";

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

export function ChatReactionPicker({
  onSelect,
}: {
  onSelect: (unified: string) => void;
}) {
  return (
    <div style={EMOJI_PICKER_THEME_VARS}>
      <ChatReactionPickerInner onSelect={onSelect} />
    </div>
  );
}
