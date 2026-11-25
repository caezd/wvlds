"use client";

import { useTranslations } from "next-intl";

import type { AutoSaveStatus } from "@/hooks/useAutoSave";
import { cn } from "@/lib/utils";

/**
 * L'état discret d'une sauvegarde automatique, près d'un titre :
 * « Enregistrement… » puis « Enregistré ». Rien au repos ni en cas d'échec
 * (le toast d'erreur le dit déjà).
 */
export function AutoSaveIndicator({ status, className }: { status: AutoSaveStatus; className?: string }) {
  const t = useTranslations("common");
  return (
    <span aria-live="polite" className={cn("text-xs font-normal text-muted-foreground", className)}>
      {status === "saving" ? t("autoSaving") : status === "saved" ? t("autoSaved") : null}
    </span>
  );
}
