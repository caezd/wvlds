"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";

export function MarkdownTextField({
  initialText,
  onSave,
}: {
  initialText: string;
  onSave: (val: string) => void;
}) {
  const tPersonas = useTranslations("personas");
  const [value, setValue] = useState(initialText);

  return (
    <ParagraphBlockEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        onSave(v);
      }}
      submitOnEnter={false}
      placeholder={tPersonas("markdownPlaceholder")}
      className="text-xs sm:text-sm leading-relaxed font-mono pr-24"
      // Le champ est un contentEditable : il grandit tout seul avec son
      // contenu. Seul le `max-h-40` par défaut du wrapper le plafonnait et
      // le faisait scroller — inadapté à une fiche, où le texte doit se lire
      // d'un bloc (l'édition d'un message lève ce plafond de même, voir
      // ChatroomMessage.tsx).
      wrapperClassName="max-h-none"
    />
  );
}
