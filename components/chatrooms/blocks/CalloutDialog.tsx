"use client";

/**
 * Fenêtre de création et d'édition d'un encadré.
 *
 * Séparée de CalloutBlock.tsx (l'affichage) : `GameBlockRenderer` importe
 * l'affichage pour CHAQUE message de salon, et la fenêtre — sélecteur
 * d'icônes et son catalogue, couleurs, emoji, éditeur — entrait avec lui dans
 * le JavaScript de tous les salons. Elle se charge maintenant à la demande.
 *
 * Les réglages fins (côtés, trait, couleurs séparées, image, mise en page,
 * typographie, repli) attendent derrière « Plus d'options ». Chacun reste
 * absent du bloc tant qu'il n'est pas choisi : sa valeur par défaut se lit
 * alors dans lib/calloutStyle.ts.
 */

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Square, PanelLeft, Minus, Ban, AlignLeft, AlignCenter, AlignRight, ImagePlus, X, Plus, Loader2, ChevronDown,
} from "lucide-react";
import type {
  CalloutAlign,
  CalloutBlock,
  CalloutBorder,
  CalloutBorderStyle,
  CalloutBorderWidth,
  CalloutField,
  CalloutFont,
  CalloutIconKind,
  CalloutIconPosition,
  CalloutIconSize,
  CalloutImageMode,
  CalloutRadius,
  CalloutSide,
  CalloutWidth,
  Gauge,
} from "@/lib/chat-blocks";
import {
  CALLOUT_BG_INTENSITIES,
  CALLOUT_IMAGE_VEILS,
  CALLOUT_SIDES,
  bordersFromSides,
  compactCallout,
  resolveCalloutStyle,
} from "@/lib/calloutStyle";
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
import { Switch } from "@/components/ui/switch";
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

/* ─── Contrôles ──────────────────────────────────────────────────────────── */

type IconType = React.ComponentType<{ className?: string }>;

const choiceClass = (selected: boolean) => cn(
  "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors",
  // Choisie : la bordure seule change, le fond reste.
  selected ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground",
);

/** Une rangée de choix exclusifs, avec son intitulé. */
function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; Icon?: IconType }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="space-y-1.5">
      <Label id={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(({ value: v, label: optionLabel, Icon }) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={choiceClass(value === v)}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{optionLabel}</span>
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Un réglage tout ou rien : intitulé à gauche, interrupteur à droite. */
function SwitchRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Une couleur facultative : vide = celle de l'accent. */
function ColorRow({ label, value, onChange, chooseLabel, noneLabel }: {
  label: string; value: string; onChange: (v: string) => void; chooseLabel: string; noneLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <ColorSwatchRow className="contents" value={value} onChange={onChange} chooseLabel={chooseLabel} noneLabel={noneLabel} />
    </div>
  );
}

/* ─── Dialog (création + édition) ────────────────────────────────────────── */

type BorderPreset = CalloutBorder;
type BorderOption = { value: BorderPreset; labelKey: string; Icon: IconType };
const BORDER_OPTION_DEFS: BorderOption[] = [
  { value: "full", labelKey: "callout.borderFull", Icon: Square },
  { value: "left", labelKey: "callout.borderLeft", Icon: PanelLeft },
  { value: "separator", labelKey: "callout.borderSeparator", Icon: Minus },
  { value: "none", labelKey: "callout.borderNone", Icon: Ban },
];

/** Les réglages qui ouvrent d'emblée « Plus d'options » quand l'encadré en porte un. */
const ADVANCED_KEYS = [
  "sides", "borderWidth", "borderStyle", "radius", "rounded", "titleColor", "borderColor", "bgColor",
  "bgIntensity", "image", "width", "iconPosition", "iconSize", "titleFont", "titleSmallCaps", "bodyItalic", "collapsible",
] as const;

function hasAdvanced(block: CalloutBlock | undefined) {
  if (!block) return false;
  const compact = compactCallout(block);
  return ADVANCED_KEYS.some((key) => compact[key] !== undefined);
}

/** L'état de la fenêtre, tiré d'un encadré (vide pour un nouveau). */
function stateFrom(block: CalloutBlock | undefined) {
  const border = block?.border ?? "full";
  return {
    title: block?.title ?? "",
    text: block?.text ?? "",
    icon: block?.icon ?? "",
    iconKind: block?.iconKind ?? ("lucide" as CalloutIconKind),
    iconImageUrl: block?.iconImage ?? "",
    accent: block?.accent ?? "",
    separator: border === "separator",
    sides: block ? resolveCalloutStyle(block).sides : [...CALLOUT_SIDES],
    align: block?.align ?? ("left" as CalloutAlign),
    gauges: block?.gauges ?? [],
    fields: block?.fields ?? [],
    borderWidth: block?.borderWidth,
    borderStyle: block?.borderStyle,
    radius: block?.radius ?? (block?.rounded === false ? ("none" as CalloutRadius) : undefined),
    titleColor: block?.titleColor ?? "",
    borderColor: block?.borderColor ?? "",
    bgColor: block?.bgColor ?? "",
    bgIntensity: block?.bgIntensity,
    image: block?.image ?? "",
    imageMode: block?.imageMode,
    imageVeil: block?.imageVeil,
    width: block?.width,
    iconPosition: block?.iconPosition,
    iconSize: block?.iconSize,
    titleFont: block?.titleFont,
    titleSmallCaps: block?.titleSmallCaps === true,
    bodyItalic: block?.bodyItalic === true,
    collapsible: block?.collapsible === true,
    showAdvanced: hasAdvanced(block),
  };
}

type DialogState = ReturnType<typeof stateFrom>;

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

  const [state, setState] = useState<DialogState>(() => stateFrom(initialBlock));
  const set = <K extends keyof DialogState>(key: K, value: DialogState[K]) => setState((s) => ({ ...s, [key]: value }));
  const [iconImageUploading, setIconImageUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Chaque ouverture repart de `initialBlock` (vide pour un nouvel encadré),
  // y compris quand le parent ouvre la fenêtre lui-même (`open` contrôlé) :
  // sans quoi le menu « Insérer un bloc » rouvrait le contenu du précédent.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setState(stateFrom(initialBlock));
  }

  const { title, text, icon, iconKind, iconImageUrl, accent, separator, sides, align, gauges, fields } = state;

  function applyPreset(p: Preset) {
    const border = p.block.border ?? "full";
    setState((s) => ({
      ...s,
      title: p.block.title ?? "",
      icon: p.block.icon ?? "",
      iconKind: p.block.iconKind ?? "lucide",
      iconImageUrl: "",
      accent: p.block.accent ?? "",
      separator: border === "separator",
      sides: resolveCalloutStyle({ _type: "callout", border }).sides,
      borderWidth: undefined,
      align: p.block.align ?? "left",
      gauges: [],
    }));
  }

  function applyBorder(border: BorderPreset) {
    setState((s) => ({
      ...s,
      separator: border === "separator",
      sides: border === "separator" ? s.sides : resolveCalloutStyle({ _type: "callout", border }).sides,
      // L'épaisseur repart de celle du style : fine pour une carte, épaisse à gauche.
      borderWidth: undefined,
    }));
  }

  function toggleSide(side: CalloutSide) {
    setState((s) => ({
      ...s,
      sides: s.sides.includes(side) ? s.sides.filter((x) => x !== side) : CALLOUT_SIDES.filter((x) => x === side || s.sides.includes(x)),
    }));
  }

  function addGauge() {
    set("gauges", [...gauges, { name: "", current: 0, max: 10, color: DEFAULT_PLAYER_COLOR }]);
  }
  function updateGauge(i: number, patch: Partial<Gauge>) {
    set("gauges", gauges.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }
  function removeGauge(i: number) {
    set("gauges", gauges.filter((_, j) => j !== i));
  }

  function addField() {
    set("fields", [...fields, { key: "", value: "" }]);
  }
  function updateField(i: number, patch: Partial<CalloutField>) {
    set("fields", fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }
  function removeField(i: number) {
    set("fields", fields.filter((_, j) => j !== i));
  }

  const hasIconImage = iconKind === "image" && !!iconImageUrl;
  const hasIcon = iconKind === "image" ? hasIconImage : !!icon;
  const filledFields = fields
    .map((f) => ({ key: f.key.trim(), value: f.value.trim() }))
    .filter((f) => f.key || f.value);
  const isValid = !!(title.trim() || text.trim() || hasIcon || gauges.length > 0 || filledFields.length > 0);

  /** Le bloc tel que la fenêtre le décrit, réglages par défaut compris. */
  function draftBlock(): CalloutBlock {
    const block: CalloutBlock = {
      _type: "callout",
      border: separator ? "separator" : bordersFromSides(sides),
      align,
    };
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
    if (filledFields.length > 0) block.fields = filledFields;
    if (!separator) block.sides = sides;
    if (state.borderWidth) block.borderWidth = state.borderWidth;
    if (state.borderStyle) block.borderStyle = state.borderStyle;
    if (state.radius) block.radius = state.radius;
    if (state.titleColor) block.titleColor = state.titleColor;
    if (state.borderColor) block.borderColor = state.borderColor;
    if (state.bgColor) block.bgColor = state.bgColor;
    if (state.bgIntensity !== undefined) block.bgIntensity = state.bgIntensity;
    if (state.image) {
      block.image = state.image;
      if (state.imageMode) block.imageMode = state.imageMode;
      if (state.imageVeil !== undefined) block.imageVeil = state.imageVeil;
    }
    if (state.width) block.width = state.width;
    if (state.iconPosition) block.iconPosition = state.iconPosition;
    if (state.iconSize) block.iconSize = state.iconSize;
    if (state.titleFont) block.titleFont = state.titleFont;
    if (state.titleSmallCaps) block.titleSmallCaps = true;
    if (state.bodyItalic) block.bodyItalic = true;
    if (state.collapsible) block.collapsible = true;
    return block;
  }

  function handleSend() {
    if (!isValid) return;
    onSend(JSON.stringify(compactCallout(draftBlock())));
    setOpen(false);
  }

  const previewBlock = draftBlock();
  // Ce que chaque réglage vaut à l'écran, défaut compris : la carte choisie.
  const resolved = resolveCalloutStyle(previewBlock);
  const borderPreset: BorderPreset | null = separator
    ? "separator"
    : sides.length === CALLOUT_SIDES.length ? "full"
      : sides.length === 0 ? "none"
        : sides.length === 1 && sides[0] === "left" ? "left"
          : null;

  const sideLabels: Record<CalloutSide, string> = {
    top: t("callout.sideTop"),
    right: t("callout.alignRight"),
    bottom: t("callout.sideBottom"),
    left: t("callout.alignLeft"),
  };

  async function upload(
    e: React.ChangeEvent<HTMLInputElement>,
    setUploading: (v: boolean) => void,
    done: (url: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file || !onUploadIconImage) return;
    setUploading(true);
    const url = await onUploadIconImage(file);
    setUploading(false);
    if (url) done(url);
    e.target.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
                  onChange={(e) => set("title", e.target.value)}
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
                    onChange={(v) => set("text", v)}
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
                      onClick={() => setState((s) => ({ ...s, icon: "", iconKind: "lucide", iconImageUrl: "" }))}
                    >
                      {t("callout.iconNone")}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <LucideIconPicker
                    value={iconKind === "lucide" ? icon : ""}
                    accent={accent || undefined}
                    onChange={(name) => setState((s) => ({ ...s, icon: name, iconKind: "lucide", iconImageUrl: "" }))}
                  />
                  <EmojiPickerButton
                    emojiStyle="twitter"
                    className="w-full"
                    value={iconKind === "emoji" ? icon : ""}
                    onChange={(v) => setState((s) => ({ ...s, icon: v, iconKind: "emoji", iconImageUrl: "" }))}
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
                    onChange={(e) => upload(e, setIconImageUploading, (url) =>
                      setState((s) => ({ ...s, iconImageUrl: url, iconKind: "image", icon: "" })))}
                  />
                </div>
              </div>

              {/* Couleur d'accent */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">{t("callout.accentLabel")}</Label>

                <ColorSwatchRow
                  className="contents"
                  value={accent}
                  onChange={(v) => set("accent", v)}
                  chooseLabel={t("callout.accentChoose")}
                  noneLabel={t("callout.accentNone")}
                />
              </div>

              {/* Bordure */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("callout.borderLabel")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {BORDER_OPTION_DEFS.map(({ value, labelKey, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={borderPreset === value}
                      onClick={() => applyBorder(value)}
                      className={cn(choiceClass(borderPreset === value), "flex-col gap-1 py-2 text-xs-plus")}
                    >
                      <Icon className="h-4 w-4" />
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alignement */}
              <ChoiceGroup
                label={t("callout.alignLabel")}
                value={align}
                onChange={(v) => set("align", v)}
                options={[
                  { value: "left", label: t("callout.alignLeft"), Icon: AlignLeft },
                  { value: "center", label: t("callout.alignCenter"), Icon: AlignCenter },
                  { value: "right", label: t("callout.alignRight"), Icon: AlignRight },
                ]}
              />

              {/* Champs « clé : valeur » */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("callout.fieldsLabel")}</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={addField}>
                    <Plus className="h-3 w-3" />
                    {t("callout.fieldsAdd")}
                  </Button>
                </div>
                {fields.length > 0 && (
                  <div className="space-y-2">
                    {fields.map((field, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={field.key}
                          onChange={(e) => updateField(i, { key: e.target.value })}
                          placeholder={t("callout.fieldKeyPlaceholder")}
                          className="h-7 w-32 shrink-0 text-xs"
                        />
                        <Input
                          value={field.value}
                          onChange={(e) => updateField(i, { value: e.target.value })}
                          placeholder={t("callout.fieldValuePlaceholder")}
                          className="h-7 min-w-0 flex-1 text-xs"
                        />
                        <Button
                          aria-label={tCommon("remove")}
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 hover:text-destructive"
                          onClick={() => removeField(i)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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

              {/* Plus d'options */}
              <button
                type="button"
                aria-expanded={state.showAdvanced}
                onClick={() => set("showAdvanced", !state.showAdvanced)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", state.showAdvanced && "rotate-180")} />
                {state.showAdvanced ? t("callout.fewerOptions") : t("callout.moreOptions")}
              </button>

              {state.showAdvanced && (
                <div className="space-y-6 border-t border-border pt-4">
                  {/* Bordure en détail */}
                  <section className="space-y-3">
                    <SectionLabel>{t("callout.borderLabel")}</SectionLabel>
                    {!separator && (
                      <div role="group" aria-label={t("callout.sidesLabel")} className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t("callout.sidesLabel")}</Label>
                        <div className="grid grid-cols-4 gap-2">
                          {CALLOUT_SIDES.map((side) => (
                            <button
                              key={side}
                              type="button"
                              aria-pressed={sides.includes(side)}
                              onClick={() => toggleSide(side)}
                              className={choiceClass(sides.includes(side))}
                            >
                              {sideLabels[side]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <ChoiceGroup<CalloutBorderWidth>
                      label={t("callout.borderWidthLabel")}
                      value={resolved.borderWidth}
                      onChange={(v) => set("borderWidth", v)}
                      options={[
                        { value: "thin", label: t("callout.borderThin") },
                        { value: "medium", label: t("callout.sizeMedium") },
                        { value: "thick", label: t("callout.borderThick") },
                      ]}
                    />
                    <ChoiceGroup<CalloutBorderStyle>
                      label={t("callout.borderStyleLabel")}
                      value={resolved.borderStyle}
                      onChange={(v) => set("borderStyle", v)}
                      options={[
                        { value: "solid", label: t("callout.styleSolid") },
                        { value: "dashed", label: t("callout.styleDashed") },
                        { value: "dotted", label: t("callout.styleDotted") },
                        { value: "double", label: t("callout.styleDouble") },
                      ]}
                    />
                    {!separator && (
                      <ChoiceGroup<CalloutRadius>
                        label={t("callout.borderRound")}
                        value={resolved.radius}
                        onChange={(v) => set("radius", v)}
                        options={[
                          { value: "none", label: t("callout.levelNone") },
                          { value: "soft", label: t("callout.levelLight") },
                          { value: "round", label: t("callout.levelStrong") },
                        ]}
                      />
                    )}
                  </section>

                  {/* Couleurs, fond et image */}
                  <section className="space-y-3">
                    <SectionLabel>{t("callout.colorsLabel")}</SectionLabel>
                    <ColorRow
                      label={t("callout.titleColorLabel")}
                      value={state.titleColor}
                      onChange={(v) => set("titleColor", v)}
                      chooseLabel={t("callout.accentChoose")}
                      noneLabel={t("callout.colorAsAccent")}
                    />
                    <ColorRow
                      label={t("callout.borderLabel")}
                      value={state.borderColor}
                      onChange={(v) => set("borderColor", v)}
                      chooseLabel={t("callout.accentChoose")}
                      noneLabel={t("callout.colorAsAccent")}
                    />
                    {!separator && (
                      <>
                        <ColorRow
                          label={t("callout.bgColorLabel")}
                          value={state.bgColor}
                          onChange={(v) => set("bgColor", v)}
                          chooseLabel={t("callout.accentChoose")}
                          noneLabel={t("callout.colorAsAccent")}
                        />
                        <ChoiceGroup<number>
                          label={t("callout.bgIntensityLabel")}
                          value={resolved.bgIntensity}
                          onChange={(v) => set("bgIntensity", v)}
                          options={CALLOUT_BG_INTENSITIES.map((v, i) => ({
                            value: v,
                            label: t(`callout.${(["levelNone", "levelLight", "levelMedium", "levelMarked", "levelStrong"] as const)[i]}`),
                          }))}
                        />

                        {/* Image de fond ou bandeau */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">{t("callout.backgroundImageLabel")}</Label>
                            {state.image && (
                              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => set("image", "")}>
                                {tCommon("remove")}
                              </Button>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={imageUploading || !onUploadIconImage}
                            onClick={() => onUploadIconImage && imageFileInputRef.current?.click()}
                            title={!onUploadIconImage ? t("callout.imageDisabled") : undefined}
                            className="w-full justify-start px-3 has-[>svg]:px-3 disabled:pointer-events-auto disabled:cursor-not-allowed"
                          >
                            {imageUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                            ) : state.image ? (
                              <span className="relative h-5 w-8 shrink-0 overflow-hidden rounded-sm">
                                <StoredImage url={state.image} width={AVATAR_THUMB_SMALL * 2} resize="cover" className="object-cover" />
                              </span>
                            ) : (
                              <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className={cn("flex-1 truncate text-left text-sm", !state.image && "text-muted-foreground")}>
                              {state.image ? t("callout.imageChange") : t("callout.imageLabel")}
                            </span>
                          </Button>
                          <input
                            ref={imageFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => upload(e, setImageUploading, (url) => set("image", url))}
                          />
                        </div>
                        {state.image && (
                          <>
                            <ChoiceGroup<CalloutImageMode>
                              label={t("callout.imageLabel")}
                              value={resolved.imageMode}
                              onChange={(v) => setState((s) => ({ ...s, imageMode: v, imageVeil: undefined }))}
                              options={[
                                { value: "background", label: t("callout.imageModeBackground") },
                                { value: "banner", label: t("callout.imageModeBanner") },
                              ]}
                            />
                            <ChoiceGroup<number>
                              label={t("callout.imageVeilLabel")}
                              value={resolved.imageVeil}
                              onChange={(v) => set("imageVeil", v)}
                              hint={t("callout.imageVeilHint")}
                              options={CALLOUT_IMAGE_VEILS.map((v, i) => ({
                                value: v,
                                label: t(`callout.${(["levelNone", "levelLight", "levelMedium", "levelStrong"] as const)[i]}`),
                              }))}
                            />
                          </>
                        )}
                      </>
                    )}
                  </section>

                  {/* Mise en page */}
                  <section className="space-y-3">
                    <SectionLabel>{t("callout.layoutLabel")}</SectionLabel>
                    <ChoiceGroup<CalloutWidth>
                      label={t("callout.widthLabel")}
                      value={resolved.width}
                      onChange={(v) => set("width", v)}
                      options={[
                        { value: "full", label: t("callout.widthFull") },
                        { value: "medium", label: t("callout.sizeMedium") },
                        { value: "narrow", label: t("callout.widthNarrow") },
                      ]}
                    />
                    {!separator && (
                      <>
                        <ChoiceGroup<CalloutIconPosition>
                          label={t("callout.iconPositionLabel")}
                          value={resolved.iconPosition}
                          onChange={(v) => setState((s) => ({ ...s, iconPosition: v, iconSize: undefined }))}
                          options={[
                            { value: "inline", label: t("callout.iconInline") },
                            { value: "side", label: t("callout.iconSide") },
                            { value: "top", label: t("callout.iconTop") },
                          ]}
                        />
                        <ChoiceGroup<CalloutIconSize>
                          label={t("callout.iconSizeLabel")}
                          value={resolved.iconSize}
                          onChange={(v) => set("iconSize", v)}
                          options={[
                            { value: "small", label: t("callout.sizeSmall") },
                            { value: "medium", label: t("callout.sizeMedium") },
                            { value: "large", label: t("callout.sizeLarge") },
                          ]}
                        />
                      </>
                    )}
                  </section>

                  {/* Typographie */}
                  <section className="space-y-3">
                    <SectionLabel>{t("callout.typographyLabel")}</SectionLabel>
                    <ChoiceGroup<CalloutFont>
                      label={t("callout.titleFontLabel")}
                      value={resolved.titleFont}
                      onChange={(v) => set("titleFont", v)}
                      options={[
                        { value: "inherit", label: t("callout.fontInherit") },
                        { value: "serif", label: t("callout.fontSerif") },
                        { value: "mono", label: t("callout.fontMono") },
                        { value: "hand", label: t("callout.fontHand") },
                      ]}
                    />
                    <SwitchRow label={t("callout.titleSmallCaps")} checked={state.titleSmallCaps} onChange={(v) => set("titleSmallCaps", v)} />
                    <SwitchRow label={t("callout.bodyItalic")} checked={state.bodyItalic} onChange={(v) => set("bodyItalic", v)} />
                  </section>

                  <SwitchRow
                    label={t("callout.collapsible")}
                    checked={state.collapsible}
                    onChange={(v) => set("collapsible", v)}
                    hint={t("callout.collapsibleHint")}
                  />
                </div>
              )}
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
