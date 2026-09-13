"use client";

import dynamic from "next/dynamic";
import { EmojiPickerFrame } from "./EmojiPickerFrame";

// Picker + données de locale FR chargés uniquement côté client et de façon
// paresseuse (le bundle n'est tiré qu'à l'ouverture du picker).
const ChatReactionPickerInner = dynamic(
  () => import("./ChatReactionPickerInner"),
  { ssr: false },
);

export function ChatReactionPicker({
  onSelect,
}: {
  onSelect: (unified: string) => void;
}) {
  return (
    <EmojiPickerFrame>
      <ChatReactionPickerInner onSelect={onSelect} />
    </EmojiPickerFrame>
  );
}
