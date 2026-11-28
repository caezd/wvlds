"use client";

/**
 * Fenêtre de création et d'édition d'un encadré.
 *
 * Séparée de CalloutBlock.tsx (l'affichage) : `GameBlockRenderer` importe
 * l'affichage pour CHAQUE message de salon, et la fenêtre — sélecteur
 * d'icônes et son catalogue, couleurs, emoji, éditeur — entrait avec lui dans
 * le JavaScript de tous les salons. Elle se charge maintenant à la demande.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Square, PanelLeft, Minus, Ban, AlignLeft, AlignCenter, ImagePlus, X, Plus, Loader2 } from "lucide-react";
import type { CalloutBlock, CalloutBorder, CalloutAlign, CalloutIconKind, Gauge } from "@/lib/chat-blocks";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColorSwatchRow } from "@/components/ui/color-swatch-row";
import { PLAYER_COLORS, DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/ui/section-label";
import { StoredImage } from "@/components/ui/stored-image";
import { AVATAR_THUMB_SMALL } from "@/lib/storage";
import { EmojiPickerButton } from "@/components/chatrooms/reactions/EmojiPickerButton";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { CalloutBlockView } from "./CalloutBlock";

/* ─── Presets : reproduisent l'esprit des anciens blocs ──────────────────── */

type Preset = {
  key: string;
  label: string;
  block: Omit<CalloutBlock, "_type" | "text">;
};

const PRESET_KEYS = ["aside", "memory", "scene", "ellipsis", "atmosphere"] as const;
type PresetKey = typeof PRESET_KEYS[number];

const PRESET_BLOCKS: Record<PresetKey, Omit<CalloutBlock, "_type" | "text">> = {
  aside: { icon: "quote", iconKind: "lucide", title: "", accent: "#C084FC", border: "full", align: "left" },
  memory: { icon: "clock", iconKind: "lucide", title: "", accent: "#FBBF24", border: "left", align: "left" },
  scene: { icon: "", iconKind: "lucide", title: "", accent: "#2DD4BF", border: "separator", align: "center" },
  ellipsis: { icon: "hourglass", iconKind: "lucide", title: "", accent: "#818CF8", border: "separator", align: "center" },
  atmosphere: { icon: "☀️", iconKind: "emoji", title: "", accent: "#60A5FA", border: "full", align: "left" },
};


/* ─── Dialog (création + édition) ────────────────────────────────────────── */

type BorderOption = { value: CalloutBorder; labelKey: string; Icon: React.ComponentType<{ className?: string }> };
const BORDER_OPTION_DEFS: BorderOption[] = [
  { value: "full", labelKey: "callout.borderFull", Icon: Square },
  { value: "left", labelKey: "callout.borderLeft", Icon: PanelLeft },
  { value: "separator", labelKey: "callout.borderSeparator", Icon: Minus },
  { value: "none", labelKey: "callout.borderNone", Icon: Ban },
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
  const tCommon = useTranslations("common");

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

  // Chaque ouverture repart de `initialBlock` (vide pour un nouvel encadré),
  // y compris quand le parent ouvre la fenêtre lui-même (`open` contrôlé) :
  // sans quoi le menu « Insérer un bloc » rouvrait le contenu du précédent.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset();
  }

  function handleOpen(v: boolean) {
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
    setGauges((prev) => [...prev, { name: "", current: 0, max: 10, color: DEFAULT_PLAYER_COLOR }]);
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
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-w-[75vw]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Square className="h-4 w-4" />
            {t("callout.title")}
          </DialogTitle>
        </DialogHeader>

        {/* La fenêtre ne dépasse jamais l'écran (100 vh) : un encadré au texte
            long l'étirait au-delà, formulaire et boutons coupés. Elle suit son
            contenu jusque-là, puis chaque colonne défile seule ; en-tête et
            boutons restent visibles. */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-border sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-[minmax(0,1fr)]">
          {/* Aperçu live — à gauche, défile seul */}
          <div
            className="flex max-h-[30vh] min-h-0 shrink-0 flex-col gap-2 overflow-y-auto border-b border-border bg-background/40 p-5 sm:max-h-none sm:border-b-0 sm:border-r"
            data-testid="callout-preview-pane"
          >
            <SectionLabel as="p">
              {t("callout.preview")}
            </SectionLabel>
            {/* `my-auto` plutôt qu'un centrage flex : centré tant qu'il tient,
                le haut reste visible dès qu'il déborde. */}
            <div className="flex flex-1 flex-col">
              <div className="my-auto">
                <CalloutBlockView block={previewBlock} mine={false} />
              </div>
            </div>
          </div>

          {/* Formulaire — défile à droite */}
          <ScrollArea className="min-h-0 flex-1 sm:h-full">
            <div className="space-y-4 p-5">
              {/* Presets */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("callout.templates")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <Button
                      key={p.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => applyPreset(p)}
                    >
                      {p.label}
                    </Button>
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
                {/* Même éditeur que le composeur, et mêmes retours que son
                    Maj+Entrée : un premier retour fait un saut de ligne, un
                    second ouvre un nouveau paragraphe. Le texte s'enregistre
                    comme un message (paragraphes séparés par une ligne vide).
                    Ctrl/⌘+Entrée insère l'encadré. */}
                <div
                  className="rounded-md border border-input bg-transparent px-3 py-2 shadow-2xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
                  onKeyDownCapture={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSend();
                    }
                  }}
                  onKeyDown={(e) => {
                    // L'éditeur a déjà traité un second retour (nouveau
                    // paragraphe) : il a alors empêché le comportement natif.
                    // Pour un premier retour, le navigateur couperait le bloc
                    // (Entrée seule) au lieu d'insérer un saut de ligne comme
                    // Maj+Entrée : on insère ce saut nous-mêmes.
                    if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                    e.preventDefault();
                    document.execCommand("insertLineBreak");
                  }}
                  data-testid="callout-content-editor"
                >
                  <ParagraphBlockEditor
                    value={text}
                    onChange={setText}
                    placeholder={t("callout.contentPlaceholder")}
                    submitOnEnter={false}
                    formatting
                    className="w-full text-sm"
                    wrapperClassName="min-h-16 max-h-60"
                  />
                </div>
              </div>

              {/* Icône */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("callout.iconLabel")}</Label>
                  {(icon || hasIconImage) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => { setIcon(""); setIconKind("lucide"); setIconImageUrl(""); }}
                    >
                      {t("callout.iconNone")}
                    </Button>
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
                  <Button
                    type="button"
                    variant="outline"
                    disabled={iconImageUploading || !onUploadIconImage}
                    onClick={() => onUploadIconImage && iconFileInputRef.current?.click()}
                    title={!onUploadIconImage ? t("callout.imageDisabled") : undefined}
                    // Désactivé, il garde les évènements du pointeur : le `title` qui dit pourquoi doit s'afficher.
                    className="w-full justify-start px-3 has-[>svg]:px-3 disabled:pointer-events-auto disabled:cursor-not-allowed"
                  >
                    {iconImageUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                    ) : hasIconImage ? (
                      <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-sm">
                        <StoredImage
                          url={iconImageUrl}
                          width={AVATAR_THUMB_SMALL}
                          height={AVATAR_THUMB_SMALL}
                          resize="cover"
                          className="object-cover"
                        />
                      </span>
                    ) : (
                      <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn("flex-1 truncate text-left text-sm", !hasIconImage && "text-muted-foreground")}>
                      {hasIconImage ? t("callout.imageChange") : t("callout.imageLabel")}
                    </span>
                  </Button>
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
              <div className="flex flex-wrap items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">{t("callout.accentLabel")}</Label>

                <ColorSwatchRow
                  className="contents"
                  value={accent}
                  onChange={setAccent}
                  chooseLabel={t("callout.accentChoose")}
                  noneLabel={t("callout.accentNone")}
                />
              </div>

              {/* Bordure */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("callout.borderLabel")}</Label>
                  {border !== "separator" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={rounded}
                      className="h-6 px-2 text-xs"
                      onClick={() => setRounded((r) => !r)}
                    >
                      {t("callout.borderRound")}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {BORDER_OPTION_DEFS.map(({ value, labelKey, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBorder(value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs-plus transition-all",
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={addGauge}
                  >
                    <Plus className="h-3 w-3" />
                    {t("callout.gaugesAdd")}
                  </Button>
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
                              aria-label={tCommon("chooseColor")}
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2 z-popover" align="end">
                            <div className="grid grid-cols-4 gap-1">
                              {PLAYER_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => updateGauge(i, { color: c })}
                                  aria-label={`${tCommon("chooseColor")} ${c}`}
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
                        <Button
                          aria-label={tCommon("remove")}
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 hover:text-destructive"
                          onClick={() => removeGauge(i)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t("callout.cancel")}</Button>
          <Button onClick={handleSend} disabled={!isValid}>
            {initialBlock ? t("callout.save") : t("callout.insert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
