"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { History, Loader2, X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { createClient } from "@/lib/supabase/client";

type WikiPageVersion = {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  author: { username: string | null } | null;
};

export type WikiRestorePatch = {
  content: string;
  draft_content: string;
  draft_updated_at: string;
  published_at: string;
};

export function WikiVersionHistoryPanel({
  open,
  onOpenChange,
  pageId,
  supabase,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  supabase: ReturnType<typeof createClient>;
  onRestored: (patch: WikiRestorePatch) => void;
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");

  const [versions, setVersions] = React.useState<WikiPageVersion[] | null>(null);
  const [previewing, setPreviewing] = React.useState<WikiPageVersion | null>(null);
  const [confirmRestore, setConfirmRestore] = React.useState<WikiPageVersion | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setVersions(null);
    setPreviewing(null);
    void (async () => {
      const { data, error } = await supabase
        .from("world_wiki_page_versions")
        .select("id, title, content, created_at, author:profiles(username)")
        .eq("page_id", pageId)
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); setVersions([]); return; }
      setVersions(data as unknown as WikiPageVersion[]);
    })();
  }, [open, pageId, supabase]);

  async function restore(version: WikiPageVersion) {
    setRestoring(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({
        content: version.content,
        draft_content: version.content,
        draft_updated_at: nowIso,
        published_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", pageId);
    setRestoring(false);
    if (error) { toast.error(t("saveError"), { description: error.message }); return; }
    onRestored({
      content: version.content ?? "",
      draft_content: version.content ?? "",
      draft_updated_at: nowIso,
      published_at: nowIso,
    });
    toast.success(t("versionRestored"));
    onOpenChange(false);
  }

  return (
    <>
      <DeleteConfirmDialog
        open={!!confirmRestore}
        onOpenChange={o => { if (!o) setConfirmRestore(null); }}
        title={t("restoreVersionTitle")}
        description={t("restoreVersionDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("restore")}
        onConfirm={() => {
          if (confirmRestore) void restore(confirmRestore);
          setConfirmRestore(null);
        }}
      />

      <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
        <DrawerContent className="inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0 w-[min(calc(100%_-_var(--drawer-inset)*2),_460px)]">
          <DrawerClose
            aria-label={tCommon("close")}
            className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="size-4" />
          </DrawerClose>
          <DrawerHeader className="border-b border-border-soft">
            <DrawerTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> {t("versionHistory")}
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1">
            <div className={cn("min-h-0 w-64 shrink-0 overflow-y-auto p-3", previewing && "border-r border-border-soft")}>
              {versions === null ? (
                <div className="flex items-center justify-center p-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : versions.length === 0 ? (
                <p className="p-2 text-sm italic text-muted-foreground">{t("noVersions")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {versions.map(v => (
                    <li
                      key={v.id}
                      className={cn(
                        "rounded-md border px-3 py-2",
                        previewing?.id === v.id ? "border-primary/40 bg-primary/5" : "border-border-soft",
                      )}
                    >
                      <button type="button" className="block w-full text-left" onClick={() => setPreviewing(v)}>
                        <span className="block text-sm font-medium">
                          {new Date(v.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.author?.username ?? t("unknownAuthor")}
                        </span>
                      </button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={() => setConfirmRestore(v)}
                        disabled={restoring}
                      >
                        {t("restore")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {previewing && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <MarkdownRenderer content={previewing.content ?? ""} />
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
