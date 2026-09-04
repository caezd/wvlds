"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenText, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { BUBBLE_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { updateMapRegion, type MapRegion } from "@/app/actions/worldMap";
import type { WikiPageOption } from "./types";
import { ColorInput } from "./ColorInput";

/**
 * Le panneau d'une région : son nom, sa description, sa page du wiki.
 *
 * Dans un coin du cadre plutôt qu'accroché à la région : un polygone n'a pas
 * de « haut » où poser une flèche, et son centre peut être n'importe où —
 * sous le panneau lui-même, souvent. Le même dessin que le panneau d'un lieu,
 * en plus court : une région se décrit, elle ne se joue pas.
 */
export function RegionPanel({
  region,
  wikiPages,
  isEditMode,
  worldId,
  onClose,
  onUpdated,
  onDelete,
}: {
  region: MapRegion;
  wikiPages: WikiPageOption[];
  isEditMode: boolean;
  worldId: string;
  onClose: () => void;
  onUpdated: (region: MapRegion) => void;
  onDelete: (region: MapRegion) => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [label, setLabel] = React.useState(region.label);
  const [description, setDescription] = React.useState(region.description ?? "");
  const [color, setColor] = React.useState(region.color);
  const [wikiPageId, setWikiPageId] = React.useState<string | null>(region.wiki_page_id);

  // Une autre région, ou la même relue : le brouillon repart de ce qu'elle est.
  React.useEffect(() => {
    if (!editing) {
      setLabel(region.label);
      setDescription(region.description ?? "");
      setColor(region.color);
      setWikiPageId(region.wiki_page_id);
    }
  }, [region, editing]);

  const linkedPage = wikiPages.find((p) => p.id === region.wiki_page_id) ?? null;

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const champs = { label: label.trim(), description: description || null, color, wiki_page_id: wikiPageId };
      await updateMapRegion(region.id, champs);
      onUpdated({ ...region, ...champs });
      setEditing(false);
      toast.success(t("regionUpdated"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={t("region")}
      data-region-panel
      className="absolute right-2 top-2 z-40 flex w-72 max-w-[calc(100%-1rem)] flex-col gap-2 rounded-xl border border-border bg-background p-3 shadow-xl"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: editing ? color : region.color }} />
        {editing ? (
          <input
            value={label}
            aria-label={t("regionName")}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border-soft bg-background px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{region.label}</h3>
        )}
        <button
          type="button"
          aria-label={tCommon("close")}
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <>
          <ColorInput color={color} onChange={setColor} presets={BUBBLE_COLOR_PRESETS} />
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("wikiPage")}
            <select
              value={wikiPageId ?? ""}
              onChange={(e) => setWikiPageId(e.target.value || null)}
              className="rounded-md border border-border-soft bg-background px-2 py-1 text-xs font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("noWikiPage")}</option>
              {wikiPages.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {!editing && linkedPage && (
        <button
          type="button"
          onClick={() => router.push(`/w/${worldId}?view=wiki&page=${encodeURIComponent(linkedPage.slug)}`)}
          className="flex w-fit items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <BookOpenText className="h-3.5 w-3.5" /> {t("openWikiPage")} : {linkedPage.title}
        </button>
      )}

      <div className="max-h-40 overflow-y-auto">
        {editing ? (
          <ParagraphBlockEditor
            value={description}
            onChange={setDescription}
            placeholder={t("descPlaceholder")}
            submitOnEnter={false}
            wrapperClassName="max-h-32"
          />
        ) : region.description ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
            <MarkdownRenderer content={region.description} />
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            {isEditMode ? t("addDescriptionHint") : t("noDescription")}
          </p>
        )}
      </div>

      {isEditMode && (
        <div className="flex items-center gap-2 border-t border-border-soft pt-2">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving || !label.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {tCommon("save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {tCommon("cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                {tCommon("edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("deleteRegion")}
                className="ml-auto text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      )}

      <DeleteConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteRegionTitle", { label: region.label })}
        description={t("deleteRegionDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => { setConfirmDelete(false); onDelete(region); }}
      />
    </div>
  );
}
