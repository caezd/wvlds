"use client";

import EmojiPicker, {
  type EmojiClickData,
  type Theme,
  type EmojiStyle,
  type SkinTonePickerLocation,
} from "emoji-picker-react";
import frData from "emoji-picker-react/dist/data/emojis-fr.js";

export default function EmojiNativePickerInner({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <EmojiPicker
      onEmojiClick={(d: EmojiClickData) => onSelect(d.emoji)}
      emojiData={frData}
      theme={"dark" as unknown as Theme}
      emojiStyle={"native" as unknown as EmojiStyle}
      lazyLoadEmojis
      width={320}
      height={380}
      previewConfig={{ showPreview: false }}
      skinTonePickerLocation={"PREVIEW" as unknown as SkinTonePickerLocation}
    />
  );
}
