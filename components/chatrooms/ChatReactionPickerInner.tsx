"use client";

import EmojiPicker, {
  type EmojiClickData,
  type Theme,
  type EmojiStyle,
  type SkinTonePickerLocation,
} from "emoji-picker-react";
// Extension .js explicite : sans extension, Turbopack résout vers le .ts source
// de node_modules (non transpilé) → "Unknown module type". Le .js est le module
// compilé (ESM, `export default data`) et la .d.ts voisine fournit le typage.
import frData from "emoji-picker-react/dist/data/emojis-fr.js";

/**
 * Contenu réel du picker. Importé dynamiquement par ChatReactionPicker
 * (ssr: false) pour que la lib emoji-picker-react ET les données de locale FR
 * ne soient tirées que dans un chunk paresseux, à l'ouverture du picker.
 *
 * On stocke le code `unified` de l'emoji (et non le caractère natif) afin de
 * pouvoir afficher la réaction avec le rendu Twitter côté message.
 */
export default function ChatReactionPickerInner({
  onSelect,
}: {
  onSelect: (unified: string) => void;
}) {
  return (
    <EmojiPicker
      onEmojiClick={(d: EmojiClickData) => onSelect(d.unified)}
      emojiData={frData}
      theme={"dark" as unknown as Theme}
      emojiStyle={"twitter" as unknown as EmojiStyle}
      lazyLoadEmojis
      width={320}
      height={400}
      searchDisabled
      previewConfig={{ showPreview: true }}
      skinTonePickerLocation={"PREVIEW" as unknown as SkinTonePickerLocation}
    />
  );
}
