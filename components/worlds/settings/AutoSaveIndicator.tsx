"use client";

import { useTranslations } from "next-intl";

import type { AutoSaveStatus } from "@/hooks/useAutoSave";
import { cn } from "@/lib/utils";

/**
 * L'envoi en cours d'une sauvegarde automatique, près d'un titre :
 * « Enregistrement… ». La réussite passe par un toast (`useAutoSave`),
 * l'échec aussi.
 */
export function AutoSaveIndicator({ status, className }: { status: AutoSaveStatus; className?: string }) {
  const t = useTranslations("common");
  return (
    <span aria-live="polite" className={cn("text-xs font-normal text-muted-foreground", className)}>
      {status === "saving" ? t("autoSaving") : null}
    </span>
  );
}
