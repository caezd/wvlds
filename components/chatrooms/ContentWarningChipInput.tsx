"use client";

import type { KeyboardEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ligne « avertissement de contenu » : icône + chips retirables + champ de
 * saisie + bouton pour désactiver la section. Partagée entre le composer et
 * le mode édition d'un message.
 */
export function ContentWarningChipInput({
  tags,
  input,
  onInputChange,
  onKeyDown,
  onBlur,
  onRemove,
  onDisable,
  placeholder,
  className,
}: {
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onRemove: (tag: string) => void;
  onDisable: () => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      {tags.map((tagLabel) => (
        <button
          key={tagLabel}
          type="button"
          // onMouseDown (pas onClick) précède le blur du champ de saisie : en
          // annulant son comportement par défaut ici, le champ ne perd pas le
          // focus avant que ce clic ne soit traité, ce qui évite qu'un texte
          // en cours de frappe soit ajouté comme tag au moment où on clique
          // pour en retirer un autre.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRemove(tagLabel)}
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 transition-colors hover:text-destructive dark:text-amber-400"
        >
          {tagLabel}
          <X className="h-2.5 w-2.5" />
        </button>
      ))}
      <input
        type="text"
        data-testid="content-warning-input"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={tags.length ? "" : placeholder}
        className="min-w-32 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDisable}
        className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
