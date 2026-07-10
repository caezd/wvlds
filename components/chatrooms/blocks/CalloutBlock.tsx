"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Square, PanelLeft, Minus, Ban, AlignLeft, AlignCenter, Palette, ImagePlus, X, Plus, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { CalloutBlock, CalloutBorder, CalloutAlign, CalloutIconKind, Gauge } from "@/lib/chat-blocks";
import {
  LucideIconPicker,
  VALID_LUCIDE_ICONS as VALID_ICON_SET,
} from "@/components/ui/LucideIconPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HsvColorPicker, ACCENT_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { EmojiPickerButton } from "@/components/chatrooms/reactions/EmojiPickerButton";
import { ReactionEmoji } from "@/components/chatrooms/reactions/ReactionEmoji";
import { GameBlockSurface, GameBlockToolbar, GameBlockEditButton } from "./GameBlockShell";

/* ─── Presets : reproduisent l'esprit des anciens blocs ──────────────────── */

type Preset = {
  key: string;
  label: string;
  block: Omit<CalloutBlock, "_type" | "text">;
};

const PRESET_KEYS = ["aside", "memory", "scene", "ellipsis", "atmosphere"] as const;
type PresetKey = typeof PRESET_KEYS[number];

const PRESET_BLOCKS: Record<PresetKey, Omit<CalloutBlock, "_type" | "text">> = {
  aside: { icon: "quote", iconKind: "lucide", title: "", accent: "#9aa0a6", border: "full", align: "left" },
  memory: { icon: "clock", iconKind: "lucide", title: "", accent: "#f59e0b", border: "left", align: "left" },
  scene: { icon: "", iconKind: "lucide", title: "", accent: "#9aa0a6", border: "separator", align: "center" },
  ellipsis: { icon: "hourglass", iconKind: "lucide", title: "", accent: "#9aa0a6", border: "separator", align: "center" },
  atmosphere: { icon: "☀️", iconKind: "emoji", title: "", accent: "#60A5FA", border: "full", align: "left" },
};

const DEFAULT_ACCENT = "#9aa0a6";

const GAUGE_COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#9aa0a6",
];

/* ─── Helpers de rendu ───────────────────────────────────────────────────── */

function renderIcon(
  icon: string | undefined,
  iconKind: CalloutIconKind | undefined,
  iconImage: string | undefined,
  accent: string | undefined,
  size = "h-4 w-4",
  emojiPx = 18,
  sizePx = 16,
) {
  if (iconKind === "image") {
    if (!iconImage) return null;
    return (
      <Image
        src={iconImage}
        alt=""
        width={sizePx}
        height={sizePx}
        className={cn(size, "shrink-0 rounded-sm object-cover")}
      />
    );
  }
  if (!icon) return null;
  if (iconKind === "lucide") {
    if (!VALID_ICON_SET.has(icon)) return null;
    return (
      <DynamicIcon
        name={icon as IconName}
        className={cn(size, "shrink-0", !accent && "text-muted-foreground")}
        style={accent ? { color: accent } : undefined}
      />
    );
  }
  // emoji → rendu Twitter (cohérent avec les réactions)
  return (
    <span className="shrink-0 leading-none">
      <ReactionEmoji value={icon} size={emojiPx} />
    </span>
  );
}

function renderGauges(gauges: Gauge[], gaugeDefault: string) {
  return (
    <>
      {gauges.map((gauge, i) => {
        const pct = gauge.max > 0
          ? Math.min(100, Math.max(0, Math.round((gauge.current / gauge.max) * 100)))
          : 0;
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{gauge.name || gaugeDefault}</span>
              <span className="font-mono text-muted-foreground">{gauge.current}/{gauge.max}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: gauge.color }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ─── Rendu Markdown ────────────────────────────────────────────────────── */

function CalloutMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed text-foreground/80 [&>*:last-child]:mb-0", className)}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p className="mb-1">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{children}</code>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 italic opacity-70 mb-1">{children}</blockquote>,
          a: ({ href, children }) => {
            const safe = href && /^https?:\/\//i.test(href) ? href : href?.startsWith("/") ? href : "#";
            return <a href={safe} className="underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          h1: ({ children }) => <p className="font-bold mb-1">{children}</p>,
          h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
          h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/* ─── Vue ────────────────────────────────────────────────────────────────── */

export function CalloutBlockView({
  block,
  mine,
  onEdit,
  onDelete,
  onUploadIconImage,
}: {
  block: CalloutBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onUploadIconImage?: (file: File) => Promise<string | null>;
}) {
  const t = useTranslations("chatrooms");
  const accent = block.accent;
  const hasAccent = !!accent;
  const border: CalloutBorder = block.border ?? "full";
  const align: CalloutAlign = block.align ?? "left";
  const rounded = block.rounded !== false;
  const hasGauges = !!block.gauges && block.gauges.length > 0;

  const toolbar = (className?: string) => (
    <GameBlockToolbar
      mine={mine}
      className={className}
      editDialog={
        onEdit && (
          <CalloutDialog
            initialBlock={block}
            onSend={onEdit}
            trigger={<GameBlockEditButton />}
            onUploadIconImage={onUploadIconImage}
          />
        )
      }
      onDelete={onDelete}
      deleteDescription="L'encadré sera supprimé définitivement."
    />
  );

  /* Style séparateur : titre centré entre deux filets, corps en dessous. */
  if (border === "separator") {
    return (
      <div className="group/gblock relative w-full py-6">
        {toolbar("absolute -top-3 right-0 z-10 rounded-md bg-card/90 shadow-sm p-0.5")}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest",
              !hasAccent && "text-muted-foreground/70",
            )}
            style={hasAccent ? { color: accent } : undefined}
          >
            {renderIcon(block.icon, block.iconKind, block.iconImage, accent, "h-3 w-3", 14, 12)}
            {block.title}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {block.text && (
          <CalloutMarkdown className={cn("mt-4", align === "center" && "text-center")}>
            {block.text}
          </CalloutMarkdown>
        )}
        {hasGauges && (
          <div className={cn("space-y-2", (block.text) && "mt-3")}>
            {renderGauges(block.gauges!, t("callout.gaugeDefault"))}
          </div>
        )}
      </div>
    );
  }

  /* Styles « carte » : full / left / none.
     Sans accent → fond transparent + bordure neutre (classes par défaut). */
  const surfaceStyle: React.CSSProperties = !hasAccent
    ? {}
    : border === "full"
      ? {
        backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${accent} 28%, transparent)`,
      }
      : border === "left"
        ? {
          backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
          borderLeftColor: accent,
        }
        : {};

  const surfaceClass = cn(
    !hasAccent && "bg-transparent",
    border === "left" && "border-l-4",
    border === "none" && "border-0 bg-transparent px-0 py-1",
    !rounded && "rounded-none",
    "p-4"
  );

  const hasHeader = !!(block.icon || block.title || (block.iconKind === "image" && block.iconImage));

  return (
    <GameBlockSurface className={surfaceClass} style={surfaceStyle}>
      {toolbar("absolute -top-3 right-2 z-10 rounded-md bg-card/90 shadow-sm p-0.5")}
      <div className={cn(align === "center" && "flex flex-col items-center text-center")}>
        {hasHeader && (
          <div className={cn("flex items-center gap-1.5", align === "center" && "justify-center")}>
            {renderIcon(block.icon, block.iconKind, block.iconImage, accent)}
            {block.title && (
              <span className="text-sm font-semibold" style={hasAccent ? { color: accent } : undefined}>
                {block.title}
              </span>
            )}
          </div>
        )}
        {block.text && (
          <CalloutMarkdown className={cn(hasHeader && "mt-1")}>
            {block.text}
          </CalloutMarkdown>
        )}
        {hasGauges && (
          <div className={cn("w-full space-y-2", (hasHeader || block.text) && "mt-3")}>
            {renderGauges(block.gauges!, t("callout.gaugeDefault"))}
          </div>
        )}
      </div>
    </GameBlockSurface>
  );
}

/* ─── Dialog (création + édition) ────────────────────────────────────────── */

type BorderOption = { value: CalloutBorder; labelKey: string; Icon: React.ComponentType<{ className?: string }> };
const BORDER_OPTION_DEFS: BorderOption[] = [
  { value: "full", labelKey: "callout.borderFull", Icon: Square },
  { value: "left", labelKey: "callout.borderLeft", Icon: PanelLeft },
  { value: "separator", labelKey: "callout.borderSeparator", Icon: Minus },
  { value: "none", labelKey: "callout.borderTop", Icon: Ban },
];

export function CalloutDialog({
  onSend,
  initialBlock,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onUploadIconImage,
}: {
  onSend: (content: string) => void;
  initialBlock?: CalloutBlock;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  onUploadIconImage?: (file: File) => Promise<string | null>;
}) {
  const t = useTranslations("chatrooms");

  const PRESETS: Preset[] = PRESET_KEYS.map((key) => ({
    key,
    label: t(`callout.presets.${key}`),
    block: {
      ...PRESET_BLOCKS[key],
      title: t(`callout.presetTitles.${key}`),
    },
  }));

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [title, setTitle] = useState(initialBlock?.title ?? "");
  const [text, setText] = useState(initialBlock?.text ?? "");
  const [icon, setIcon] = useState(initialBlock?.icon ?? "");
  const [iconKind, setIconKind] = useState<CalloutIconKind>(initialBlock?.iconKind ?? "lucide");
  const [iconImageUrl, setIconImageUrl] = useState(initialBlock?.iconImage ?? "");
  const [iconImageUploading, setIconImageUploading] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  // "" = aucun accent (fond transparent)
  const [accent, setAccent] = useState(initialBlock?.accent ?? "");
  const [border, setBorder] = useState<CalloutBorder>(initialBlock?.border ?? "full");
  const [align, setAlign] = useState<CalloutAlign>(initialBlock?.align ?? "left");
  const [rounded, setRounded] = useState(initialBlock?.rounded !== false);
  const [gauges, setGauges] = useState<Gauge[]>(initialBlock?.gauges ?? []);

  function reset() {
    setTitle(initialBlock?.title ?? "");
    setText(initialBlock?.text ?? "");
    setIcon(initialBlock?.icon ?? "");
    setIconKind(initialBlock?.iconKind ?? "lucide");
    setIconImageUrl(initialBlock?.iconImage ?? "");
    setAccent(initialBlock?.accent ?? "");
    setBorder(initialBlock?.border ?? "full");
    setAlign(initialBlock?.align ?? "left");
    setRounded(initialBlock?.rounded !== false);
    setGauges(initialBlock?.gauges ?? []);
  }

  function handleOpen(v: boolean) {
    if (v) reset();
    setOpen(v);
  }

  function applyPreset(p: Preset) {
    setTitle(p.block.title ?? "");
    setIcon(p.block.icon ?? "");
    setIconKind(p.block.iconKind ?? "lucide");
    setIconImageUrl("");
    setAccent(p.block.accent ?? "");
    setBorder(p.block.border ?? "full");
    setAlign(p.block.align ?? "left");
    setRounded(p.block.rounded !== false);
    setGauges([]);
  }

  function addGauge() {
    setGauges((prev) => [...prev, { name: "", current: 0, max: 10, color: GAUGE_COLOR_PRESETS[0] }]);
  }
  function updateGauge(i: number, patch: Partial<Gauge>) {
    setGauges((prev) => prev.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }
  function removeGauge(i: number) {
    setGauges((prev) => prev.filter((_, j) => j !== i));
  }

  const hasIconImage = iconKind === "image" && !!iconImageUrl;
  const hasIcon = iconKind === "image" ? hasIconImage : !!icon;
  const isValid = !!(title.trim() || text.trim() || hasIcon || gauges.length > 0);

  function handleSend() {
    if (!isValid) return;
    const block: CalloutBlock = { _type: "callout", border, align, rounded };
    if (title.trim()) block.title = title.trim();
    if (text.trim()) block.text = text.trim();
    if (iconKind === "image") {
      block.iconKind = "image";
      if (iconImageUrl) block.iconImage = iconImageUrl;
    } else if (icon) {
      block.icon = icon;
      block.iconKind = iconKind;
    }
    if (accent) block.accent = accent;
    if (gauges.length > 0) block.gauges = gauges;
    onSend(JSON.stringify(block));
    setOpen(false);
  }

  const previewBlock: CalloutBlock = {
    _type: "callout",
    title: title.trim() || undefined,
    text: text.trim() || undefined,
    ...(iconKind === "image"
      ? { iconKind: "image", iconImage: iconImageUrl || undefined }
      : icon ? { icon, iconKind } : {}),
    accent: accent || undefined,
    border,
    align,
    rounded,
    gauges: gauges.length > 0 ? gauges : undefined,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[75vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Square className="h-4 w-4" />
            {t("callout.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border-t border-border-soft">
          {/* Aperçu live — fixe à gauche */}
          <div className="flex flex-col gap-2 border-b border-border-soft bg-background/40 p-5 sm:border-b-0 sm:border-r">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              {t("callout.preview")}
            </Label>
            <div className="flex flex-1 items-center">
              <CalloutBlockView block={previewBlock} mine={false} />
            </div>
          </div>

          {/* Formulaire — scrolle à droite */}
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-5">
              {/* Presets */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("callout.templates")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Titre */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("callout.titleLabel")}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("callout.titlePlaceholder")}
                />
              </div>

              {/* Texte */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("callout.contentLabel")}</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("callout.contentPlaceholder")}
                  rows={3}
                  className="resize-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend(); }}
                />
              </div>

              {/* Icône */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("callout.iconLabel")}</Label>
                  {(icon || hasIconImage) && (
                    <button
                      type="button"
                      onClick={() => { setIcon(""); setIconKind("lucide"); setIconImageUrl(""); }}
                      className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("callout.iconNone")}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <LucideIconPicker
                    value={iconKind === "lucide" ? icon : ""}
                    accent={accent || undefined}
                    onChange={(name) => { setIcon(name); setIconKind("lucide"); setIconImageUrl(""); }}
                  />
                  <EmojiPickerButton
                    emojiStyle="twitter"
                    className="w-full"
                    value={iconKind === "emoji" ? icon : ""}
                    onChange={(v) => { setIcon(v); setIconKind("emoji"); setIconImageUrl(""); }}
                  />
                  {/* Bouton image */}
                  <button
                    type="button"
                    disabled={iconImageUploading || !onUploadIconImage}
                    onClick={() => onUploadIconImage && iconFileInputRef.current?.click()}
                    title={!onUploadIconImage ? t("callout.imageDisabled") : undefined}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors",
                      onUploadIconImage && !iconImageUploading ? "hover:bg-muted" : "cursor-not-allowed opacity-40",
                      hasIconImage && "border-primary/50 bg-primary/10",
                    )}
                  >
                    {iconImageUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                    ) : hasIconImage ? (
                      <Image src={iconImageUrl} alt="" width={20} height={20} className="h-5 w-5 rounded-sm object-cover shrink-0" />
                    ) : (
                      <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn("flex-1 truncate text-left text-sm", !hasIconImage && "text-muted-foreground")}>
                      {hasIconImage ? t("callout.imageChange") : t("callout.imageLabel")}
                    </span>
                  </button>
                  <input
                    ref={iconFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !onUploadIconImage) return;
                      setIconImageUploading(true);
                      const url = await onUploadIconImage(file);
                      setIconImageUploading(false);
                      if (url) { setIconImageUrl(url); setIconKind("image"); setIcon(""); }
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {/* Couleur d'accent */}
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">{t("callout.accentLabel")}</Label>

                {/* Bouton palette → picker dans un Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={t("callout.accentChoose")}
                      className="flex items-center gap-1 shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 hover:border-foreground/40 transition-colors"
                    >
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      <span
                        className="h-3 w-3 rounded-full border border-border/40"
                        style={{ backgroundColor: accent || DEFAULT_ACCENT }}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-3 z-[200]" align="start">
                    <HsvColorPicker
                      color={accent || DEFAULT_ACCENT}
                      onChange={setAccent}
                      presets={[]}
                    />
                  </PopoverContent>
                </Popover>

                {/* Pastilles preset */}
                {ACCENT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setAccent(c.value)}
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-sm border border-border/40 hover:ring-1 hover:ring-ring transition-shadow",
                      accent === c.value && "ring-2 ring-ring",
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}

                {/* Aucune */}
                <button
                  type="button"
                  onClick={() => setAccent("")}
                  className={cn(
                    "ml-auto shrink-0 rounded-md border px-2 py-0.5 text-xs transition-colors",
                    accent === ""
                      ? "border-foreground text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("callout.accentNone")}
                </button>
              </div>

              {/* Bordure */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("callout.borderLabel")}</Label>
                  {border !== "separator" && (
                    <button
                      type="button"
                      onClick={() => setRounded((r) => !r)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs transition-colors",
                        rounded
                          ? "border-foreground text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t("callout.borderRound")}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {BORDER_OPTION_DEFS.map(({ value, labelKey, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBorder(value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-all",
                        border === value
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alignement */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("callout.alignLabel")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "left" as const, labelKey: "callout.alignLeft", Icon: AlignLeft },
                    { value: "center" as const, labelKey: "callout.alignCenter", Icon: AlignCenter },
                  ]).map(({ value, labelKey, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAlign(value)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-all",
                        align === value
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jauges */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("callout.gaugesLabel")}</Label>
                  <button
                    type="button"
                    onClick={addGauge}
                    className="flex items-center gap-0.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {t("callout.gaugesAdd")}
                  </button>
                </div>
                {gauges.length > 0 && (
                  <div className="space-y-2">
                    {gauges.map((gauge, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={gauge.name}
                          onChange={(e) => updateGauge(i, { name: e.target.value })}
                          placeholder={t("callout.gaugePlaceholder")}
                          className="h-7 text-xs flex-1 min-w-0"
                        />
                        <input
                          type="number"
                          value={gauge.current}
                          onChange={(e) => updateGauge(i, { current: Number(e.target.value) })}
                          className="h-7 w-12 rounded-md border border-input bg-transparent px-2 text-xs text-center [appearance:textfield]"
                          min="0"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">/</span>
                        <input
                          type="number"
                          value={gauge.max}
                          onChange={(e) => updateGauge(i, { max: Number(e.target.value) })}
                          className="h-7 w-12 rounded-md border border-input bg-transparent px-2 text-xs text-center [appearance:textfield]"
                          min="1"
                        />
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="h-5 w-5 shrink-0 rounded-sm border border-border/60 hover:ring-1 hover:ring-ring transition-shadow"
                              style={{ backgroundColor: gauge.color }}
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2 z-[200]" align="end">
                            <div className="grid grid-cols-4 gap-1">
                              {GAUGE_COLOR_PRESETS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => updateGauge(i, { color: c })}
                                  className={cn(
                                    "h-5 w-5 rounded-sm border border-border/40 hover:ring-1 hover:ring-ring transition-shadow",
                                    gauge.color === c && "ring-2 ring-ring",
                                  )}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          onClick={() => removeGauge(i)}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="border-t border-border-soft px-6 py-4">
          <Button variant="outline" onClick={() => setOpen(false)}>{t("callout.cancel")}</Button>
          <Button onClick={handleSend} disabled={!isValid}>
            {initialBlock ? t("callout.save") : t("callout.insert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
