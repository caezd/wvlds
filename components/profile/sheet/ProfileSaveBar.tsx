"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DrawerFooter } from "@/components/ui/drawer";

/**
 * La barre d'enregistrement de « Mon profil » : l'état à gauche (modifications
 * en attente, enregistré, à jour), « Annuler » et « Enregistrer » à droite.
 */
export function ProfileSaveBar({
  dirty,
  justSaved,
  saving,
  invalid,
  onSave,
  onReset,
}: {
  dirty: boolean;
  justSaved: boolean;
  saving: boolean;
  invalid: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("userProfile.save");
  const tCommon = useTranslations("common");
  const state = dirty ? "dirty" : justSaved ? "saved" : "clean";
  return (
    <DrawerFooter className="min-h-15 shrink-0 flex-row items-center gap-2 border-t border-border px-6 py-3">
      <span role="status" data-state={state} className={cn("flex flex-1 items-center gap-2 text-xs", dirty ? "text-foreground" : "text-muted-foreground")}>
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dirty ? "bg-warning" : justSaved ? "bg-success" : "bg-muted")}
        />
        {t(state)}
      </span>
      {dirty && (
        <Button type="button" variant="secondary" size="sm" onClick={onReset} disabled={saving}>
          {tCommon("cancel")}
        </Button>
      )}
      <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving || invalid}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
        {tCommon("save")}
      </Button>
    </DrawerFooter>
  );
}
