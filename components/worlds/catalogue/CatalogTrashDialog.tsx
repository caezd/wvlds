"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { formatDaysAgo } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import type { WorldCatalogItem } from "@/types/worlds";
import { CatalogVisual } from "./CatalogVisual";

/**
 * La corbeille du catalogue : les objets supprimés, à rendre ou à effacer.
 *
 * Réservée aux éditeurs — pour un membre, un objet supprimé n'existe plus, ni
 * dans le catalogue ni dans le sélecteur de sa fiche (migration 165).
 *
 * Le décompte d'usage compte ici plus qu'ailleurs : restaurer un objet porté
 * par douze personnages leur rend leur objet d'un coup, sans qu'aucune fiche
 * soit retouchée — elles n'ont jamais cessé de le désigner.
 *
 * Calquée sur la corbeille du wiki (`WikiTrashDialog`), pour que le dépôt n'ait
 * qu'une seule façon d'annuler une suppression.
 */
export function CatalogTrashDialog({
  open,
  onOpenChange,
  items,
  loading,
  usage,
  onRestore,
  onDeleteForever,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Objets marqués supprimés, du plus récent au plus ancien. */
  items: WorldCatalogItem[];
  loading: boolean;
  usage: Record<string, number> | null;
  onRestore: (item: WorldCatalogItem) => void;
  onDeleteForever: (item: WorldCatalogItem) => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = useState<WorldCatalogItem | null>(null);

  return (
    <>
      <DeleteConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => { if (!o) setConfirming(null); }}
        title={confirming?.name ?? ""}
        description={t("trashDeleteForeverDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("trashDeleteForever")}
        onConfirm={() => {
          if (confirming) onDeleteForever(confirming);
          setConfirming(null);
        }}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("trash")}</DialogTitle>
            <DialogDescription>{t("trashDescription")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-2 text-sm italic text-muted-foreground">{t("trashEmpty")}</p>
          ) : (
            <ul className="-mx-1 max-h-80 overflow-y-auto">
              {items.map((item) => {
                const carried = usage?.[item.id] ?? 0;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/60"
                  >
                    <CatalogVisual
                      icon={item.icon}
                      lucideIcon={item.lucide_icon}
                      imageUrl={item.image_url}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.deleted_at && t("deletedAt", { when: formatDaysAgo(item.deleted_at) })}
                        {carried > 0 && ` · ${t("usageCount", { count: carried })}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestore(item)}
                      aria-label={`${t("trashRestore")} — ${item.name}`}
                      title={t("trashRestore")}
                      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("trashRestore")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(item)}
                      aria-label={`${t("trashDeleteForever")} — ${item.name}`}
                      title={t("trashDeleteForever")}
                      className="flex shrink-0 items-center rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
