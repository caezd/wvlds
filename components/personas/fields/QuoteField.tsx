"use client";

import { useState } from "react";

import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";

export function QuoteField({
  initialText,
  initialSource,
  onSave,
}: {
  initialText: string;
  initialSource: string;
  onSave: (text: string, source: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [source, setSource] = useState(initialSource);

  return (
    <div className="space-y-2 pr-24">
      <ParagraphBlockEditor
        value={text}
        onChange={(v) => { setText(v); onSave(v, source); }}
        submitOnEnter={false}
        placeholder="Citation…"
        className="text-sm italic leading-relaxed font-mono"
      />
      <input
        value={source}
        onChange={(e) => { setSource(e.target.value); onSave(text, e.target.value); }}
        placeholder="— Source (optionnel)"
        className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  );
}
