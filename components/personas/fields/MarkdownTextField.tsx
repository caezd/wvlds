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
      className="text-sm leading-relaxed font-mono pr-24"
    />
  );
}
