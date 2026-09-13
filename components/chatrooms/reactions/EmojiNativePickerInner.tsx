"use client";

import EmojiPicker, {
  type EmojiClickData,
  type Theme,
  type EmojiStyle,
  type SkinTonePickerLocation,
} from "emoji-picker-react";
import frData from "emoji-picker-react/dist/data/emojis-fr.js";
import { EMOJI_CATEGORY_ICONS } from "./emojiPickerCategoryIcons";

export default function EmojiNativePickerInner({
  onSelect,
  emojiStyle = "native",
  searchPlaceholder,
}: {
  onSelect: (emoji: string) => void;
  emojiStyle?: "native" | "twitter";
  searchPlaceholder?: string;
}) {
  return (
    <EmojiPicker
      onEmojiClick={(d: EmojiClickData) => onSelect(d.emoji)}
      emojiData={frData}
      theme={"dark" as unknown as Theme}
      emojiStyle={emojiStyle as unknown as EmojiStyle}
      categoryIcons={EMOJI_CATEGORY_ICONS}
      searchPlaceholder={searchPlaceholder}
      lazyLoadEmojis
      width={320}
      height={380}
      previewConfig={{ showPreview: false }}
      skinTonePickerLocation={"PREVIEW" as unknown as SkinTonePickerLocation}
    />
  );
}
