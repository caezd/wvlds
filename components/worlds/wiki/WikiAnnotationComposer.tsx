"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import { Button } from "@/components/ui/button";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { cn } from "@/lib/utils";

/** Saisie d'une annotation ou d'une réponse — même boîte pour les deux. */
export function WikiAnnotationComposer({
  placeholder,
  submitLabel,
  pending,
  autoFocus = true,
  onSubmit,
  onCancel,
  className,
}: {
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => void | Promise<unknown>;
  onCancel: () => void;
  className?: string;
}) {
  const tCommon = useTranslations("common");
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const empty = value.trim() === "";

  function submit() {
    if (empty || pending) return;
    void onSubmit(value);
    setValue("");
  }

  return (
    <div className={cn("space-y-2", className)}>
      <AutoResizeTextarea
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        // Le filet de la base est à 4 000 caractères (migration 137) ; le
        // formulaire s'arrête au même endroit pour refuser la saisie plutôt
        // que l'écriture.
        maxLength={DB_TEXT_LIMITS["world_wiki_page_annotations.body"]}
        minRows={2}
        maxRows={8}
        className="w-full resize-none rounded-lg border border-border-soft bg-background px-2.5 py-2 text-sm outline-none focus:border-primary/50"
        onKeyDown={e => {
          // Entrée seule fait un retour à la ligne : une annotation tient
          // souvent en plusieurs phrases.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={submit} disabled={empty || pending}>
          {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
