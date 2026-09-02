"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FileText, Folder, RotateCcw, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { formatDaysAgo } from "@/lib/utils";
import type { WikiPage } from "./WorldWiki";

/**
 * La corbeille du wiki : les pages supprimées, à restaurer ou à effacer.
 *
 * Réservée aux éditeurs — un lecteur ne voit même pas qu'une page a existé.
 * Les pages s'y listent par date de suppression, la plus récente d'abord :
 * c'est presque toujours celle qu'on vient de regretter.
 */
export function WikiTrashDialog({
  open,
  onOpenChange,
  pages,
  onRestore,
  onDeleteForever,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pages marquées supprimées, de la plus récente à la plus ancienne. */
  pages: WikiPage[];
  onRestore: (page: WikiPage) => void;
  onDeleteForever: (page: WikiPage) => void;
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = React.useState<WikiPage | null>(null);

  return (
    <>
      <DeleteConfirmDialog
        open={!!confirming}
        onOpenChange={o => { if (!o) setConfirming(null); }}
        title={t("deleteTitle", { title: confirming?.title ?? "" })}
        description={t("deleteForeverDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("deleteForever")}
        onConfirm={() => {
          if (confirming) onDeleteForever(confirming);
          setConfirming(null);
        }}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("trash")}</DialogTitle>
            <DialogDescription>{t("trashDescription")}</DialogDescription>
          </DialogHeader>

          {pages.length === 0 ? (
            <p className="py-2 text-sm italic text-muted-foreground">{t("trashEmpty")}</p>
          ) : (
            <ul className="-mx-1 max-h-80 overflow-y-auto">
              {pages.map(page => (
                <li
                  key={page.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/60"
                >
                  {page.is_folder
                    ? <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{page.title}</p>
                    {page.deleted_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("deletedAt", { when: formatDaysAgo(page.deleted_at) })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(page)}
                    aria-label={`${t("restore")} — ${page.title}`}
                    title={t("restore")}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {t("restore")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(page)}
                    aria-label={`${t("deleteForever")} — ${page.title}`}
                    title={t("deleteForever")}
                    className="flex shrink-0 items-center rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
