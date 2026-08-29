"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";

import { toWebP } from "@/lib/imageUtils";
import { supabaseThumb } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { updateMapPin, type MapPin as MapPinType } from "@/app/actions/worldMap";

import { PinVisualDialog } from "./PinVisualDialog";
import type { PinPopoverPos } from "./types";

// Popover flottant (position: fixed, positionné au clic)
export function PinPopover({
  pin,
  pos,
  isEditMode,
  userId,
  worldId,
  onClose,
  onUpdated,
  onDelete,
}: {
  pin: MapPinType;
  pos: PinPopoverPos;
  isEditMode: boolean;
  userId: string;
  worldId: string;
  onClose: () => void;
  onUpdated: (updated: MapPinType) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const supabase = createClient();

  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(pin.title);
  const [description, setDescription] = React.useState(pin.description ?? "");
  const [uploadingBanner, setUploadingBanner] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [visualDialogOpen, setVisualDialogOpen] = React.useState(false);
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

  // Sync when pin changes from outside (realtime)
  React.useEffect(() => {
    if (!editing) {
      setTitle(pin.title);
      setDescription(pin.description ?? "");
    }
  }, [pin, editing]);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await updateMapPin(pin.id, {
        title: title.trim(),
        description: description || null,
      });
      onUpdated({ ...pin, title: title.trim(), description: description || null });
      setEditing(false);
      toast.success(t("pinUpdated"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleBannerUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("imagesOnly"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("fileTooLarge5"));
      return;
    }
    setUploadingBanner(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté.");

      const converted = await toWebP(file, 1200);
      const path = `user-${userId}/world-${worldId}/pin-${pin.id}-${Date.now()}.webp`;

      const { error: upErr } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { upsert: true, contentType: converted.type });
      if (upErr) throw upErr;

      const banner_url = supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;

      await updateMapPin(pin.id, { banner_url });
      onUpdated({ ...pin, banner_url });
      toast.success(t("bannerUpdated"));
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploadingBanner(false);
    }
  }

  const bannerSrc = supabaseThumb(pin.banner_url, 680, 80) ?? pin.banner_url ?? undefined;

  return (
    <>
      <DeleteConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteTitle", { title: pin.title })}
        description={t("deleteDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />

      {isEditMode && (
        // Le div arrête la propagation vers le onClick extérieur de WorldMap
        // (les events des portals Radix remontent quand même via l'arbre React)
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <PinVisualDialog
            pin={pin}
            open={visualDialogOpen}
            onOpenChange={setVisualDialogOpen}
            onUpdated={onUpdated}
          />
        </div>
      )}

      <div
        className="fixed z-50 w-[340px] overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Bannière ─────────────────────────────────── */}
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
          {bannerSrc ? (
            <Image
              src={bannerSrc}
              alt=""
              fill
              sizes="340px"
              className="object-cover"
            />
          ) : isEditMode ? (
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {uploadingBanner ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">{t("addBanner")}</span>
                </>
              )}
            </button>
          ) : null}

          {/* Overlay bannière en mode edit si image déjà présente */}
          {bannerSrc && isEditMode && (
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 hover:bg-black/40 hover:opacity-100 transition-all"
            >
              {uploadingBanner ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Upload className="h-5 w-5 text-white" />
              )}
            </button>
          )}

          {/* Point coloré du pin — cliquable en mode édition */}
          {isEditMode ? (
            <button
              type="button"
              title={t("editPinVisual")}
              onClick={() => setVisualDialogOpen(true)}
              className="absolute bottom-2 left-3 flex h-6 w-6 items-center justify-center rounded-full shadow transition-transform hover:scale-110"
              style={{
                backgroundColor: pin.color || "transparent",
                border: pin.border_color
                  ? `2px ${pin.border_style || "solid"} ${pin.border_color}`
                  : "2px solid rgba(255,255,255,0.6)",
              }}
            >
              {pin.icon && (
                <LazyLucideIcon
                  name={pin.icon}
                  className="h-3 w-3"
                  style={{ color: pin.icon_color || "#ffffff" }}
                />
              )}
            </button>
          ) : (
            <div
              className="absolute bottom-2 left-3 flex h-6 w-6 items-center justify-center rounded-full shadow"
              style={{
                backgroundColor: pin.color || "transparent",
                border: pin.border_color
                  ? `2px ${pin.border_style || "solid"} ${pin.border_color}`
                  : "none",
              }}
            >
              {pin.icon && (
                <LazyLucideIcon
                  name={pin.icon}
                  className="h-3 w-3"
                  style={{ color: pin.icon_color || "#ffffff" }}
                />
              )}
            </div>
          )}

          {/* Bouton fermer */}
          <button
            type="button"
            aria-label={tCommon("close")}
            onClick={onClose}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleBannerUpload(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* ── Contenu ──────────────────────────────────── */}
        <div className="p-4 flex flex-col gap-3">
          {/* Titre */}
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-base font-semibold outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("locationName")}
            />
          ) : (
            <h3 className="text-base font-semibold leading-snug">{pin.title}</h3>
          )}

          {/* Description */}
          <div className="max-h-48 overflow-y-auto">
            {editing ? (
              <ParagraphBlockEditor
                value={description}
                onChange={setDescription}
                placeholder={t("descPlaceholder")}
                submitOnEnter={false}
                wrapperClassName="max-h-32"
              />
            ) : pin.description ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
                <MarkdownRenderer content={pin.description} />
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                {isEditMode ? t("addDescriptionHint") : t("noDescription")}
              </p>
            )}
          </div>

          {/* Actions */}
          {isEditMode && (
            <div className="flex items-center gap-2 pt-1 border-t border-border-soft">
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {tCommon("save")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTitle(pin.title);
                      setDescription(pin.description ?? "");
                      setEditing(false);
                    }}
                  >
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
                    className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {tCommon("delete")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
