"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import {
  Check,
  ImagePlus,
  Loader2,
  Map,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { HsvColorPicker, BUBBLE_COLOR_PRESETS, ACCENT_COLOR_PRESETS, type ColorPreset } from "@/components/ui/hsv-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toWebP } from "@/lib/imageUtils";
import { supabaseThumb } from "@/lib/storage";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  createMapPin,
  deleteMapPin,
  getWorldMap,
  updateMapPin,
  upsertWorldMap,
  type MapPin as MapPinType,
  type WorldMapData,
} from "@/app/actions/worldMap";

// ── Types ─────────────────────────────────────────────────────────

type PinPopoverPos = { left: number; top: number };

type PendingPin = {
  x: number; // pourcentage relatif à l'image
  y: number;
  title: string;
};

// ── Helpers ───────────────────────────────────────────────────────

function calcPopoverPos(clientX: number, clientY: number): PinPopoverPos {
  const cardW = 340;
  const cardH = 460;
  const pad = 12;

  let left = clientX + 16;
  let top = clientY - cardH / 2;

  if (left + cardW > window.innerWidth - pad) left = clientX - cardW - 16;
  top = Math.max(pad, Math.min(top, window.innerHeight - cardH - pad));

  return { left, top };
}

// ── Sub-components ─────────────────────────────────────────────────

function PinMarker({
  pin,
  isSelected,
  isEditMode,
  imgRef,
  scale,
  onPinClick,
  onDelete,
  onMoved,
}: {
  pin: MapPinType;
  isSelected: boolean;
  isEditMode: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  scale: number;
  onPinClick: (clientX: number, clientY: number) => void;
  onDelete: () => void;
  onMoved: (x: number, y: number) => void;
}) {
  const t = useTranslations("map");
  const [localX, setLocalX] = React.useState(pin.x);
  const [localY, setLocalY] = React.useState(pin.y);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef<{
    clientX: number; clientY: number; startX: number; startY: number;
  } | null>(null);
  const didDrag = React.useRef(false);

  // Sync position quand le pin change depuis l'extérieur (realtime)
  React.useEffect(() => {
    if (!isDragging) { setLocalX(pin.x); setLocalY(pin.y); }
  }, [pin.x, pin.y, isDragging]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation(); // empêche le pan du container
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, startX: pin.x, startY: pin.y };
    didDrag.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !isEditMode) return;
    const dx = e.clientX - dragStart.current.clientX;
    const dy = e.clientY - dragStart.current.clientY;
    if (!didDrag.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      didDrag.current = true;
      setIsDragging(true);
    }
    if (!didDrag.current) return;
    const img = imgRef.current;
    if (!img) return;
    // getBoundingClientRect tient compte du scale CSS appliqué au parent
    const r = img.getBoundingClientRect();
    setLocalX(Math.max(0, Math.min(100, dragStart.current.startX + (dx / r.width) * 100)));
    setLocalY(Math.max(0, Math.min(100, dragStart.current.startY + (dy / r.height) * 100)));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasDrag = didDrag.current;
    dragStart.current = null;
    didDrag.current = false;
    setIsDragging(false);
    if (wasDrag && isEditMode) {
      onMoved(localX, localY);
    } else {
      onPinClick(e.clientX, e.clientY);
    }
  }

  return (
    <div
      className={cn(
        "absolute group",
        isDragging ? "z-30" : "z-10",
        isEditMode && !isDragging && "cursor-grab",
        isDragging && "cursor-grabbing",
      )}
      style={{
        left: `${localX}%`,
        top: `${localY}%`,
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
        transformOrigin: "center center",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => e.stopPropagation()} // empêche handleContainerClick
    >
      {/* Halo sélectionné */}
      {isSelected && !isDragging && pin.color && pin.color !== "transparent" && (
        <span
          className="absolute inset-0 -m-1.5 rounded-full animate-ping opacity-30"
          style={{ backgroundColor: pin.color }}
        />
      )}

      {/* Cercle du pin */}
      <div
        aria-label={pin.title}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform",
          !isDragging && "hover:scale-110",
          isSelected && !isDragging && "scale-110 ring-2 ring-white ring-offset-1",
          isDragging && "scale-125 opacity-90 shadow-xl",
        )}
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
            className="h-4 w-4"
            style={{ color: pin.icon_color || "#ffffff" }}
          />
        )}
      </div>

      {/* Label au survol */}
      {!isDragging && (
        <div className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          {pin.title}
        </div>
      )}

      {/* Bouton supprimer (edit mode uniquement, sur hover) */}
      {isEditMode && !isDragging && (
        <button
          type="button"
          aria-label={t("deletePin")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Sélecteur couleur compact : carré + hex + popover HSV ─────────

function ColorInput({
  color,
  onChange,
  presets = BUBBLE_COLOR_PRESETS,
}: {
  color: string;
  onChange: (hex: string) => void;
  presets?: ColorPreset[];
}) {
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 shrink-0 rounded border border-input shadow-sm transition-shadow hover:ring-2 hover:ring-ring"
            style={{ backgroundColor: color }}
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-60 p-3 z-[200]"
          side="bottom"
          align="start"
          onWheel={(e) => e.stopPropagation()}
        >
          <HsvColorPicker color={color} onChange={onChange} presets={presets} />
        </PopoverContent>
      </Popover>
      <input
        type="text"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

// ── Dialog de personnalisation visuelle d'un pin ──────────────────

function getBorderStyles(t: ReturnType<typeof useTranslations<"map">>) {
  return [
    { value: "solid" as const, label: t("borderStyles.solid") },
    { value: "dashed" as const, label: t("borderStyles.dashed") },
    { value: "dotted" as const, label: t("borderStyles.dotted") },
  ];
}

function PinVisualDialog({
  pin,
  open,
  onOpenChange,
  onUpdated,
}: {
  pin: MapPinType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: MapPinType) => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const borderStyles = getBorderStyles(t);
  const isTransparent = (c: string) => !c || c === "transparent";

  const [bgColor, setBgColor] = React.useState(isTransparent(pin.color) ? "#6366f1" : pin.color);
  const [noBg, setNoBg] = React.useState(isTransparent(pin.color));
  const [iconName, setIconName] = React.useState(pin.icon);
  const [iconColor, setIconColor] = React.useState(pin.icon_color || "#ffffff");
  const [hasBorder, setHasBorder] = React.useState(!!pin.border_color);
  const [borderColor, setBorderColor] = React.useState(pin.border_color || "#ffffff");
  const [borderStyle, setBorderStyle] = React.useState<"solid" | "dashed" | "dotted">(
    (pin.border_style as "solid" | "dashed" | "dotted") || "solid",
  );
  const [saving, setSaving] = React.useState(false);

  // Resync quand le dialog ré-ouvre sur un pin différent
  React.useEffect(() => {
    if (!open) return;
    const transp = isTransparent(pin.color);
    setBgColor(transp ? "#6366f1" : pin.color);
    setNoBg(transp);
    setIconName(pin.icon);
    setIconColor(pin.icon_color || "#ffffff");
    setHasBorder(!!pin.border_color);
    setBorderColor(pin.border_color || "#ffffff");
    setBorderStyle((pin.border_style as "solid" | "dashed" | "dotted") || "solid");
  }, [open, pin.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      const patch = {
        color: noBg ? "transparent" : bgColor,
        icon: iconName,
        icon_color: iconColor,
        border_color: hasBorder ? borderColor : null,
        border_style: hasBorder ? borderStyle : "solid",
      };
      await updateMapPin(pin.id, patch);
      onUpdated({ ...pin, ...patch });
      onOpenChange(false);
      toast.success(t("visualUpdated"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  const effectiveBg = noBg ? "transparent" : bgColor;
  const previewBorder = hasBorder ? `2px ${borderStyle} ${borderColor}` : "none";
  const previewEmpty = noBg && !hasBorder && !iconName;

  if (!open) return null;

  const panel = (
    <>
      {/* Fond semi-transparent — clic ferme le panel */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel centré */}
      <div
        className="fixed left-1/2 top-1/2 z-[55] w-[360px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <h2 className="text-sm font-semibold">{t("pinVisual")}</h2>
          <button
            type="button"
            aria-label={tCommon("close")}
            onClick={() => onOpenChange(false)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex flex-col gap-5 p-4">
          {/* Aperçu */}
          <div className="flex items-center justify-center rounded-lg bg-muted/40 py-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
              style={{
                backgroundColor: effectiveBg,
                border: previewBorder || (previewEmpty ? "2px dashed #aaa" : "none"),
              }}
            >
              {iconName && (
                <LazyLucideIcon
                  name={iconName}
                  className="h-6 w-6"
                  style={{ color: iconColor }}
                />
              )}
            </div>
          </div>

          {/* Icône */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("icon")}</span>
              {iconName && (
                <button
                  type="button"
                  onClick={() => setIconName("")}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("removeIcon")}
                </button>
              )}
            </div>
            <LucideIconPicker value={iconName} onChange={setIconName} accent={iconColor} />
          </div>

          {/* Fond */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("background")}</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t("transparent")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={noBg}
                  onClick={() => setNoBg((v) => !v)}
                  className={cn(
                    "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                    noBg ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span className={cn(
                    "inline-block h-3 w-3 translate-x-0.5 rounded-full bg-white shadow transition-transform",
                    noBg && "translate-x-3.5",
                  )} />
                </button>
              </label>
            </div>
            {!noBg && (
              <ColorInput color={bgColor} onChange={setBgColor} presets={BUBBLE_COLOR_PRESETS} />
            )}
          </div>

          {/* Couleur de l'icône */}
          {iconName && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("iconColor")}</span>
              <ColorInput color={iconColor} onChange={setIconColor} presets={ACCENT_COLOR_PRESETS} />
            </div>
          )}

          {/* Bordure */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("border")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={hasBorder}
                onClick={() => setHasBorder((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  hasBorder ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform",
                    hasBorder && "translate-x-4",
                  )}
                />
              </button>
            </div>

            {hasBorder && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1">
                  {borderStyles.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBorderStyle(value)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        borderStyle === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <ColorInput color={borderColor} onChange={setBorderColor} presets={BUBBLE_COLOR_PRESETS} />
              </div>
            )}
          </div>
        </div>

        {/* Pied */}
        <div className="flex justify-end gap-2 border-t border-border-soft px-4 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {tCommon("save")}
          </Button>
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}

// Popover flottant (position: fixed, positionné au clic)
function PinPopover({
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

// ── Main component ─────────────────────────────────────────────────

export function WorldMap({
  worldId,
  userId,
  canEdit,
  onClose,
}: {
  worldId: string;
  userId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const reconnectEpoch = useReconnectEpoch();

  const [mapData, setMapData] = React.useState<WorldMapData | null>(null);
  const [pins, setPins] = React.useState<MapPinType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);

  const [selectedPin, setSelectedPin] = React.useState<MapPinType | null>(null);
  const [popoverPos, setPopoverPos] = React.useState<PinPopoverPos | null>(null);

  const [pendingPin, setPendingPin] = React.useState<PendingPin | null>(null);
  const [creatingPin, setCreatingPin] = React.useState(false);

  const [uploadingMap, setUploadingMap] = React.useState(false);

  // ── Pan + zoom state ─────────────────────────────────────────
  const [scale, setScale] = React.useState(1);
  const [offsetX, setOffsetX] = React.useState(0);
  const [offsetY, setOffsetY] = React.useState(0);
  const [isPanning, setIsPanning] = React.useState(false);
  const panStart = React.useRef<{
    clientX: number; clientY: number;
    startOffsetX: number; startOffsetY: number;
  } | null>(null);
  const didPan = React.useRef(false);

  // Refs pour le wheel handler non-passif (évite les stale closures)
  const scaleRef = React.useRef(scale);
  scaleRef.current = scale;
  const offsetXRef = React.useRef(offsetX);
  offsetXRef.current = offsetX;
  const offsetYRef = React.useRef(offsetY);
  offsetYRef.current = offsetY;

  const mapFileInputRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wheelCleanupRef = React.useRef<(() => void) | null>(null);

  const isEditMode = canEdit && editMode;

  // Reset pan/zoom quand l'image change
  React.useEffect(() => { setScale(1); setOffsetX(0); setOffsetY(0); }, [mapData?.image_url]);

  // ── Chargement initial ────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { map, pins: p } = await getWorldMap(worldId);
        if (!cancelled) {
          setMapData(map);
          setPins(p);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    type RT = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

    // Realtime subscriptions
    const channel = supabase
      .channel(`world-map-${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "world_map_pins", filter: `world_id=eq.${worldId}` },
        (payload: RT) => {
          if (payload.eventType === "INSERT") {
            setPins((prev) => [...prev, payload.new as MapPinType]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as MapPinType;
            setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPin((prev) => (prev?.id === updated.id ? updated : prev));
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setPins((prev) => prev.filter((p) => p.id !== id));
            setSelectedPin((prev) => (prev?.id === id ? null : prev));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "world_maps", filter: `world_id=eq.${worldId}` },
        (payload: RT) => {
          setMapData(payload.new as WorldMapData);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, reconnectEpoch]);

  // ── Upload de l'image de carte ────────────────────────────────
  async function handleMapImageUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("imagesOnly"));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("fileTooLarge20"));
      return;
    }
    setUploadingMap(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté.");

      const converted = await toWebP(file, 4096);
      const path = `user-${userId}/world-${worldId}/map-${Date.now()}.webp`;

      const { error: upErr } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { upsert: true, contentType: converted.type });
      if (upErr) throw upErr;

      const image_url = supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;
      const updated = await upsertWorldMap(worldId, { image_url });
      setMapData(updated);
      toast.success(t("mapUpdated"));
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploadingMap(false);
    }
  }

  // ── Helpers de clamp ─────────────────────────────────────────
  function clampOffset(x: number, y: number, s: number): [number, number] {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return [x, y];
    const minX = Math.min(0, container.clientWidth - img.offsetWidth * s);
    const minY = Math.min(0, container.clientHeight - img.offsetHeight * s);
    return [
      Math.max(minX, Math.min(0, x)),
      Math.max(minY, Math.min(0, y)),
    ];
  }

  // ── Wheel zoom (non-passif, centré sur le curseur) ───────────
  // Callback ref : s'exécute quand l'élément entre/sort du DOM,
  // évitant tout problème de taille de tableau de dépendances.
  const containerCallbackRef = React.useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    containerRef.current = el;
    if (!el) return;
    const node = el; // variable non-nullable pour la closure

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const curS = scaleRef.current;
      const curOX = offsetXRef.current;
      const curOY = offsetYRef.current;

      const newS = Math.max(1, Math.min(2, curS + (e.deltaY < 0 ? 0.1 : -0.1)));
      if (newS === curS) return;

      const rect = node.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const ix = (cx - curOX) / curS;
      const iy = (cy - curOY) / curS;

      let newOX = cx - ix * newS;
      let newOY = cy - iy * newS;

      const img = imageRef.current;
      if (img) {
        const minX = Math.min(0, node.clientWidth - img.offsetWidth * newS);
        const minY = Math.min(0, node.clientHeight - img.offsetHeight * newS);
        newOX = Math.max(minX, Math.min(0, newOX));
        newOY = Math.max(minY, Math.min(0, newOY));
      }

      setScale(newS);
      setOffsetX(newOX);
      setOffsetY(newOY);
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    wheelCleanupRef.current = () => node.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pan handlers ─────────────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    didPan.current = false;
    panStart.current = {
      clientX: e.clientX, clientY: e.clientY,
      startOffsetX: offsetX, startOffsetY: offsetY,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.clientX;
    const dy = e.clientY - panStart.current.clientY;
    if (!didPan.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) didPan.current = true;
    if (!didPan.current) return;
    const [cx, cy] = clampOffset(
      panStart.current.startOffsetX + dx,
      panStart.current.startOffsetY + dy,
      scale,
    );
    setOffsetX(cx);
    setOffsetY(cy);
  }

  function handlePointerUp() {
    setIsPanning(false);
    panStart.current = null;
    // didPan.current est relu dans handleContainerClick qui s'exécute juste après
  }

  // ── Clic sur la carte (ajouter un pin si pas de drag) ────────
  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (didPan.current) { didPan.current = false; return; }
    didPan.current = false;

    if (pendingPin) { setPendingPin(null); return; }
    if (selectedPin) { setSelectedPin(null); setPopoverPos(null); return; }

    if (!isEditMode) return;

    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;
    const rect = container.getBoundingClientRect();
    // Coordonnées dans l'espace image (avant scale)
    const pxX = (e.clientX - rect.left - offsetX) / scale;
    const pxY = (e.clientY - rect.top - offsetY) / scale;
    const x = (pxX / img.offsetWidth) * 100;
    const y = (pxY / img.offsetHeight) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    setPendingPin({ x, y, title: "" });
  }

  async function handleCreatePin() {
    if (!pendingPin || !pendingPin.title.trim() || creatingPin) return;
    setCreatingPin(true);
    try {
      const pin = await createMapPin(worldId, pendingPin.x, pendingPin.y, pendingPin.title.trim());
      setPins((prev) => [...prev, pin]);
      setPendingPin(null);
      // Ouvrir immédiatement la popover du nouveau pin au centre de l'écran
      setSelectedPin(pin);
      setPopoverPos(calcPopoverPos(window.innerWidth / 2, window.innerHeight / 2));
    } catch {
      toast.error(t("createPinError"));
    } finally {
      setCreatingPin(false);
    }
  }

  function handlePinClick(clientX: number, clientY: number, pin: MapPinType) {
    if (selectedPin?.id === pin.id) {
      setSelectedPin(null);
      setPopoverPos(null);
      return;
    }
    setSelectedPin(pin);
    setPopoverPos(calcPopoverPos(clientX, clientY));
    setPendingPin(null);
  }

  async function handlePinMoved(pin: MapPinType, x: number, y: number) {
    // Optimiste : mise à jour locale immédiate
    const updated = { ...pin, x, y };
    setPins((prev) => prev.map((p) => (p.id === pin.id ? updated : p)));
    if (selectedPin?.id === pin.id) setSelectedPin(updated);
    try {
      await updateMapPin(pin.id, { x, y });
    } catch {
      toast.error(t("movePinError"));
      // Rollback
      setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
    }
  }

  async function handleDeletePin(pin: MapPinType) {
    try {
      await deleteMapPin(pin.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
      if (selectedPin?.id === pin.id) {
        setSelectedPin(null);
        setPopoverPos(null);
      }
      toast.success(t("pinDeleted"));
    } catch {
      toast.error(t("deletePinError"));
    }
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      onClick={() => {
        if (pendingPin) setPendingPin(null);
        if (selectedPin) { setSelectedPin(null); setPopoverPos(null); }
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3">
        <Map className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">{t("title")}</span>

        {canEdit && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); setSelectedPin(null); setPopoverPos(null); setPendingPin(null); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isEditMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
              {isEditMode ? t("editingActive") : tCommon("edit")}
            </button>

            {isEditMode && mapData?.image_url && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); mapFileInputRef.current?.click(); }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {uploadingMap ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {t("changeMap")}
              </button>
            )}
          </>
        )}

        <div className="ml-auto">
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("closeMap")}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* ── Corps ──────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">

        {!mapData?.image_url ? (
          /* ── État vide ───────────────────────────────────────── */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <Map className="h-12 w-12 opacity-20" />
            <p className="text-sm">{t("noMapConfigured")}</p>
            {isEditMode && (
              <button
                type="button"
                onClick={() => mapFileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border px-6 py-3 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
              >
                {uploadingMap ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("importMapImage")}
              </button>
            )}
          </div>
        ) : (
          /* ── Carte avec image ────────────────────────────────── */
          <div
            ref={containerCallbackRef}
            className="relative flex-1 overflow-hidden select-none"
            style={{ cursor: isPanning ? "grabbing" : isEditMode ? "crosshair" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleContainerClick}
          >
            {/* Wrapper pan+zoom — transform-origin top-left */}
            <div
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
                transformOrigin: "0 0",
              }}
            >
              {/* Image : couvre toujours toute la largeur du container.
                  imageRef.offsetWidth/offsetHeight pilotent le clamp du pan/zoom —
                  next/image (fill) changerait ce comportement de dimensionnement intrinsèque. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={mapData.image_url}
                alt={t("mapAlt")}
                draggable={false}
                className="block w-full select-none"
                style={{ userSelect: "none" }}
              />

              {/* Pins existants */}
              {pins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  isSelected={selectedPin?.id === pin.id}
                  isEditMode={isEditMode}
                  imgRef={imageRef}
                  scale={scale}
                  onPinClick={(cx, cy) => handlePinClick(cx, cy, pin)}
                  onDelete={() => void handleDeletePin(pin)}
                  onMoved={(x, y) => void handlePinMoved(pin, x, y)}
                />
              ))}

              {/* Pin en cours de création — même pivot que PinMarker (-50%,-50%) */}
              {pendingPin && (
                <div
                  className="absolute z-20"
                  style={{
                    left: `${pendingPin.x}%`,
                    top: `${pendingPin.y}%`,
                    transform: `translate(-50%, -50%) scale(${1 / scale})`,
                    transformOrigin: "center center",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Marqueur temporaire */}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary opacity-70 shadow-md">
                    <MapPin className="h-4 w-4 text-white" />
                  </div>

                  {/* Formulaire flottant au-dessus */}
                  <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1.5 shadow-xl">
                    <input
                      autoFocus
                      value={pendingPin.title}
                      onChange={(e) =>
                        setPendingPin((p) => p ? { ...p, title: e.target.value } : p)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreatePin();
                        if (e.key === "Escape") setPendingPin(null);
                      }}
                      placeholder={t("locationName")}
                      className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      disabled={!pendingPin.title.trim() || creatingPin}
                      onClick={handleCreatePin}
                      className="flex h-5 w-5 items-center justify-center rounded text-primary disabled:opacity-40 hover:bg-primary/10"
                    >
                      {creatingPin ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPin(null)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Indice d'aide en mode édition (sticky sur le container) */}
            {isEditMode && !pendingPin && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white opacity-70">
                {t("clickToAddPin")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Popover pin sélectionné ─────────────────────────────── */}
      {selectedPin && popoverPos && (
        <PinPopover
          key={selectedPin.id}
          pin={selectedPin}
          pos={popoverPos}
          isEditMode={isEditMode}
          userId={userId}
          worldId={worldId}
          onClose={() => { setSelectedPin(null); setPopoverPos(null); }}
          onUpdated={(updated) => {
            setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPin(updated);
          }}
          onDelete={() => void handleDeletePin(selectedPin)}
        />
      )}

      {/* Input fichier carte caché */}
      <input
        ref={mapFileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleMapImageUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
