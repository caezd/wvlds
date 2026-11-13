"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * Bascule du mode modification du wiki.
 *
 * Extraite parce qu'elle apparaît à deux endroits du même bandeau : au-dessus
 * d'un article, à côté du fil d'Ariane — et au-dessus du panneau vide, quand
 * aucune page n'est encore sélectionnée. Sans ce second point, un wiki sans
 * page n'offrait plus aucun moyen d'entrer en modification, donc aucun moyen
 * de créer sa première page.
 */
export function WikiEditModeToggle({
  editMode,
  onToggle,
}: {
  editMode: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={editMode}
      // Une bascule d'affichage : `outline`, enfoncée (aria-pressed) quand l'édition est active.
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "text-xs",
      )}
    >
      <Pencil className="h-3 w-3" />
      {editMode ? t("editingActive") : tCommon("edit")}
    </button>
  );
}
