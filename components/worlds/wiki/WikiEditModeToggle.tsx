"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

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
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        editMode
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Pencil className="h-3 w-3" />
      {editMode ? t("editingActive") : tCommon("edit")}
    </button>
  );
}
