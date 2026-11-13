"use client";

import type { KeyboardEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const t = useTranslations("chatrooms");

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
      {tags.map((tagLabel, i) => (
        <button
          key={`${tagLabel}-${i}`}
          type="button"
          // onMouseDown (pas onClick) précède le blur du champ de saisie : en
          // annulant son comportement par défaut ici, le champ ne perd pas le
          // focus avant que ce clic ne soit traité, ce qui évite qu'un texte
          // en cours de frappe soit ajouté comme tag au moment où on clique
          // pour en retirer un autre.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRemove(tagLabel)}
          className={cn(badgeVariants({ tone: "warning" }), "transition-colors hover:text-destructive")}
        >
          {tagLabel}
          <X className="h-2.5 w-2.5" />
        </button>
      ))}
      <input
        type="text"
        aria-label={placeholder}
        data-testid="content-warning-input"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={tags.length ? "" : placeholder}
        className="min-w-32 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="ml-auto size-5 hover:text-destructive"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDisable}
        aria-label={t("disableContentWarning")}
        title={t("disableContentWarning")}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
