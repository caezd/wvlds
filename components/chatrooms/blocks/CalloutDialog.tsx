"use client";

/**
 * Fenêtre de création et d'édition d'un encadré.
 *
 * Séparée de CalloutBlock.tsx (l'affichage) : `GameBlockRenderer` importe
 * l'affichage pour CHAQUE message de salon, et la fenêtre — sélecteur
 * d'icônes et son catalogue, couleurs, emoji, éditeur — entrait avec lui dans
 * le JavaScript de tous les salons. Elle se charge maintenant à la demande.
 *
 * Trois onglets : Contenu (ce qui se lit), Style (couleurs, bordure, fond),
 * Mise en page (placement, icône, typographie). Chaque choix montre ce qu'il
 * fait (un trait, un arrondi, une police) plutôt que de le nommer seulement.
 * Un réglage reste absent du bloc tant qu'il n'est pas choisi : sa valeur
 * par défaut se lit alors dans lib/calloutStyle.ts.
 */

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Square, AlignLeft, AlignCenter, AlignRight, ImagePlus, X, Plus, Loader2 } from "lucide-react";
import type {
  CalloutAlign,
  CalloutBlock,
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
  CALLOUT_BORDER_WIDTH_PX,
  CALLOUT_RADIUS_PX,
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
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

const choiceClass = (selected: boolean) => cn(
  "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors",
  // Choisie : la bordure seule change, le fond reste.
  selected ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground",
);

type ChoiceOption<T> = { value: T; label: string; preview?: React.ReactNode };

/**
 * Une rangée de choix exclusifs. Avec un `preview`, chaque choix devient une
 * tuile : le dessin de ce qu'il fait au-dessus de son nom. Le dessin prend la
 * couleur du texte (`currentColor`), plus nette sur la tuile choisie.
 */
function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="space-y-1.5">
      <Label id={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(({ value: v, label: optionLabel, preview }) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={cn(choiceClass(value === v), preview && "flex-col gap-2 py-2.5")}
          >
            {preview && <span aria-hidden className="flex h-6 items-center justify-center">{preview}</span>}
            <span className="max-w-full truncate">{optionLabel}</span>
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

/** Une couleur facultative en pastille : un clic ouvre la palette. Vide = l'accent. */
function ColorChip({ label, value, fallback, onChange, chooseLabel, noneLabel }: {
  label: string;
  value: string;
  fallback?: string;
  onChange: (v: string) => void;
  chooseLabel: string;
  noneLabel: string;
}) {
  const shown = value || fallback;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={cn(choiceClass(false), "justify-start gap-2 px-2.5 py-2")}>
          <span
            className={cn("h-4 w-4 shrink-0 rounded-full border border-border", !shown && "bg-[repeating-linear-gradient(45deg,transparent_0_3px,var(--color-border)_3px_4px)]")}
            style={shown ? { backgroundColor: shown } : undefined}
          />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-foreground">{label}</span>
            {!value && <span className="block truncate text-2xs">{noneLabel}</span>}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-72 p-3" align="start">
        <ColorSwatchRow value={value} onChange={onChange} chooseLabel={chooseLabel} noneLabel={noneLabel} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Un pourcentage au curseur (intensité du fond, voile de l'image). La piste
 * dessine ce que la valeur fait ; le vrai `<input type="range">` est posé,
 * invisible, par-dessus : clavier, souris et lecteurs d'écran le manipulent
 * comme d'habitude.
 */
function PercentSlider({ label, value, track, onChange }: {
  label: string;
  value: number;
  track: React.ReactNode;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{value} %</span>
      </div>
      <div className="group relative h-6">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full border border-border">
          {track}
        </span>
        <span
          aria-hidden
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-ring"
          style={{ left: `calc(0.5rem + (100% - 1rem) * ${value / 100})` }}
        />
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

/**
 * Des choix compacts côte à côte, le choisi rempli (comme un onglet). Avec un
 * `preview`, le dessin remplace le nom, qui reste en infobulle et pour les
 * lecteurs d'écran.
 */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex items-center justify-between gap-3">
      <Label id={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="inline-flex shrink-0 rounded-lg border border-border p-0.5">
        {options.map(({ value: v, label: optionLabel, preview }) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            aria-label={preview ? optionLabel : undefined}
            title={preview ? optionLabel : undefined}
            onClick={() => onChange(v)}
            className={cn(
              "flex h-7 min-w-10 items-center justify-center rounded-md px-2.5 text-xs transition-colors",
              value === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {preview ?? optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Dessins des tuiles : de simples rectangles tracés avec le réglage lui-même. */

const lineSample = (style: React.CSSProperties) => (
  <span className="block w-6 border-current" style={{ borderTopStyle: "solid", ...style }} />
);

function cornerSample(radius: number) {
  return <span className="mt-1 ml-1 block h-3.5 w-4 border-t-2 border-l-2 border-current" style={{ borderTopLeftRadius: radius }} />;
}

function widthSample(pct: number) {
  return (
    <span className="flex h-4 w-10 items-center rounded-xs border border-current/40 px-0.5">
      <span className="h-2 rounded-xs bg-current" style={{ width: `${pct}%` }} />
    </span>
  );
}

function iconPositionSample(position: CalloutIconPosition) {
  const lines = (
    <span className="flex flex-col gap-1">
      <span className="h-px w-5 bg-current" />
      <span className="h-px w-4 bg-current opacity-60" />
    </span>
  );
  if (position === "side") {
    return <span className="flex items-center gap-1"><span className="h-4 w-4 rounded-xs bg-current" />{lines}</span>;
  }
  if (position === "top") {
    return <span className="flex flex-col items-center gap-1"><span className="h-2.5 w-2.5 rounded-xs bg-current" /><span className="h-px w-6 bg-current" /></span>;
  }
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-xs bg-current" /><span className="h-px w-6 bg-current" /></span>;
}

/**
 * Un côté du cadre, cliquable : la zone est centrée sur le bord. Un côté
 * affiché se voit avec le vrai trait de la bordure ; un côté masqué laisse
 * un pointillé discret, pour qu'on sache qu'il peut s'ajouter.
 */
function SideToggle({ side, label, on, onToggle }: { side: CalloutSide; label: string; on: boolean; onToggle: () => void }) {
  const horizontal = side === "top" || side === "bottom";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onToggle}
      className={cn(
        "absolute flex items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        side === "top" && "inset-x-6 top-3 h-6",
        side === "bottom" && "inset-x-6 bottom-3 h-6",
        side === "left" && "inset-y-6 left-3 w-6",
        side === "right" && "inset-y-6 right-3 w-6",
      )}
    >
      {!on && (
        <span
          aria-hidden
          className={cn(
            "border-dashed border-muted-foreground/50",
            horizontal ? "w-full border-t" : "h-full border-l",
          )}
        />
      )}
    </button>
  );
}

/* ─── Dialog (création + édition) ────────────────────────────────────────── */

type Tab = "content" | "style" | "layout";

/** L'état de la fenêtre, tiré d'un encadré (vide pour un nouveau). */
function stateFrom(block: CalloutBlock | undefined) {
  const border = block?.border ?? "full";
  return {
    tab: "content" as Tab,
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

  /** Cadre ou séparateur : l'épaisseur repart de celle de la forme. */
  function applyShape(shape: "frame" | "separator") {
    setState((s) => ({
      ...s,
      separator: shape === "separator",
      sides: shape === "frame" && s.sides.length === 0 ? [...CALLOUT_SIDES] : s.sides,
      borderWidth: undefined,
    }));
  }

  /** Raccourcis : tous les côtés, le seul côté gauche (filet épais), aucun. */
  function applySides(next: CalloutSide[]) {
    setState((s) => ({ ...s, sides: next, borderWidth: undefined }));
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
  // Ce que chaque réglage vaut à l'écran, défaut compris : la tuile choisie.
  const resolved = resolveCalloutStyle(previewBlock);
  const sideLabels: Record<CalloutSide, string> = {
    top: t("callout.sideTop"),
    right: t("callout.alignRight"),
    bottom: t("callout.sideBottom"),
    left: t("callout.alignLeft"),
  };
  const tint = resolved.bgColor ?? "var(--color-foreground)";
  // Le cadre de l'éditeur de bordure se dessine avec la vraie bordure.
  const framePx = resolved.borderStyle === "double"
    ? Math.max(CALLOUT_BORDER_WIDTH_PX[resolved.borderWidth], 3)
    : CALLOUT_BORDER_WIDTH_PX[resolved.borderWidth];
  const frameColor = resolved.borderColor ?? "var(--color-muted-foreground)";
  const frameStyle: React.CSSProperties = {
    borderStyle: resolved.borderStyle,
    borderColor: frameColor,
    borderRadius: CALLOUT_RADIUS_PX[resolved.radius],
    borderTopWidth: sides.includes("top") ? framePx : 0,
    borderRightWidth: sides.includes("right") ? framePx : 0,
    borderBottomWidth: sides.includes("bottom") ? framePx : 0,
    borderLeftWidth: sides.includes("left") ? framePx : 0,
    ...(resolved.bgColor && resolved.bgIntensity > 0 && {
      backgroundColor: `color-mix(in srgb, ${resolved.bgColor} ${resolved.bgIntensity}%, transparent)`,
    }),
  };
  const separatorLine: React.CSSProperties = {
    borderTopWidth: framePx,
    borderTopStyle: resolved.borderStyle,
    borderTopColor: frameColor,
  };
  const sameSides = (a: CalloutSide[], b: CalloutSide[]) => a.length === b.length && a.every((x) => b.includes(x));
  const quickSides: { key: string; label: string; sides: CalloutSide[] }[] = [
    { key: "all", label: t("callout.sidesAll"), sides: [...CALLOUT_SIDES] },
    { key: "left", label: t("callout.alignLeft"), sides: ["left"] },
    { key: "none", label: t("callout.levelNone"), sides: [] },
  ];

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
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[min(46rem,92dvh)] sm:max-w-[75vw]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Square className="h-4 w-4" />
            {t("callout.title")}
          </DialogTitle>
        </DialogHeader>

        {/* Hauteur fixe sur grand écran : changer d'onglet ne fait pas sauter
            la fenêtre. Chaque colonne défile seule ; en-tête, onglets et
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

          {/* Formulaire en onglets — défile à droite */}
          <Tabs value={state.tab} onValueChange={(v) => set("tab", v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabBar listClassName="px-5">
              <TabBarTrigger value="content">{t("callout.tabContent")}</TabBarTrigger>
              <TabBarTrigger value="style">{t("callout.tabStyle")}</TabBarTrigger>
              <TabBarTrigger value="layout">{t("callout.layoutLabel")}</TabBarTrigger>
            </TabBar>
            <ScrollArea className="min-h-0 flex-1">
              {/* ── Contenu ── */}
              <TabsContent value="content" className="space-y-5 p-5">
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

                <SwitchRow
                  label={t("callout.collapsible")}
                  checked={state.collapsible}
                  onChange={(v) => set("collapsible", v)}
                  hint={t("callout.collapsibleHint")}
                />
              </TabsContent>

              {/* ── Style ── */}
              <TabsContent value="style" className="space-y-7 p-5">
                <section className="space-y-3">
                  <SectionLabel>{t("callout.colorsLabel")}</SectionLabel>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{t("callout.accentLabel")}</span>
                    <ColorSwatchRow
                      className="contents"
                      value={accent}
                      onChange={(v) => set("accent", v)}
                      chooseLabel={t("callout.accentChoose")}
                      noneLabel={t("callout.accentNone")}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <ColorChip
                      label={t("callout.titleColorLabel")}
                      value={state.titleColor}
                      fallback={accent || undefined}
                      onChange={(v) => set("titleColor", v)}
                      chooseLabel={t("callout.accentChoose")}
                      noneLabel={t("callout.colorAsAccent")}
                    />
                    <ColorChip
                      label={t("callout.borderLabel")}
                      value={state.borderColor}
                      fallback={accent || undefined}
                      onChange={(v) => set("borderColor", v)}
                      chooseLabel={t("callout.accentChoose")}
                      noneLabel={t("callout.colorAsAccent")}
                    />
                    {!separator && (
                      <ColorChip
                        label={t("callout.bgColorLabel")}
                        value={state.bgColor}
                        fallback={accent || undefined}
                        onChange={(v) => set("bgColor", v)}
                        chooseLabel={t("callout.accentChoose")}
                        noneLabel={t("callout.colorAsAccent")}
                      />
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionLabel>{t("callout.borderLabel")}</SectionLabel>
                  <Segmented<"frame" | "separator">
                    label={t("callout.borderShapeLabel")}
                    value={separator ? "separator" : "frame"}
                    onChange={applyShape}
                    options={[
                      { value: "frame", label: t("callout.borderFrame") },
                      { value: "separator", label: t("callout.borderSeparator") },
                    ]}
                  />
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    {/* Le cadre, dessiné avec la bordure choisie ; ses côtés se cliquent. */}
                    <div className="flex shrink-0 flex-col items-center gap-2">
                      {separator ? (
                        <div aria-hidden className="flex h-32 w-48 items-center gap-2 rounded-lg bg-muted/30 px-4">
                          <span className="flex-1" style={separatorLine} />
                          <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">{t("callout.titleColorLabel")}</span>
                          <span className="flex-1" style={separatorLine} />
                        </div>
                      ) : (
                        <>
                          <div role="group" aria-label={t("callout.sidesLabel")} className="relative h-32 w-48 rounded-lg bg-muted/30">
                            <span aria-hidden className="absolute inset-6" style={frameStyle} />
                            {CALLOUT_SIDES.map((side) => (
                              <SideToggle
                                key={side}
                                side={side}
                                label={sideLabels[side]}
                                on={sides.includes(side)}
                                onToggle={() => toggleSide(side)}
                              />
                            ))}
                          </div>
                          <div role="group" aria-label={t("callout.sidesQuick")} className="flex gap-1">
                            {quickSides.map((q) => (
                              <button
                                key={q.key}
                                type="button"
                                aria-pressed={sameSides(sides, q.sides)}
                                onClick={() => applySides(q.sides)}
                                className={cn(
                                  "rounded-md px-2 py-0.5 text-xs transition-colors",
                                  sameSides(sides, q.sides) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                              >
                                {q.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <p className="max-w-48 text-center text-2xs text-muted-foreground">
                        {separator ? t("callout.separatorHint") : t("callout.sidesHint")}
                      </p>
                    </div>

                    {/* Le trait */}
                    <div className="min-w-0 flex-1 space-y-3">
                      <Segmented<CalloutBorderStyle>
                        label={t("callout.borderStyleLabel")}
                        value={resolved.borderStyle}
                        onChange={(v) => set("borderStyle", v)}
                        options={(["solid", "dashed", "dotted", "double"] as const).map((v) => ({
                          value: v,
                          label: t(`callout.style${v[0].toUpperCase()}${v.slice(1)}`),
                          preview: lineSample({ borderTopWidth: v === "double" ? 4 : 2, borderTopStyle: v }),
                        }))}
                      />
                      <Segmented<CalloutBorderWidth>
                        label={t("callout.borderWidthLabel")}
                        value={resolved.borderWidth}
                        onChange={(v) => set("borderWidth", v)}
                        options={[
                          { value: "thin", label: t("callout.borderThin"), preview: lineSample({ borderTopWidth: 1 }) },
                          { value: "medium", label: t("callout.sizeMedium"), preview: lineSample({ borderTopWidth: 2 }) },
                          { value: "thick", label: t("callout.borderThick"), preview: lineSample({ borderTopWidth: 4 }) },
                        ]}
                      />
                      {!separator && (
                        <Segmented<CalloutRadius>
                          label={t("callout.borderRound")}
                          value={resolved.radius}
                          onChange={(v) => set("radius", v)}
                          options={[
                            { value: "none", label: t("callout.levelNone"), preview: cornerSample(0) },
                            { value: "soft", label: t("callout.levelLight"), preview: cornerSample(4) },
                            { value: "round", label: t("callout.levelStrong"), preview: cornerSample(10) },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                </section>

                {!separator && (
                  <section className="space-y-4">
                    <SectionLabel>{t("callout.bgColorLabel")}</SectionLabel>
                    <PercentSlider
                      label={t("callout.bgIntensityLabel")}
                      value={resolved.bgIntensity}
                      onChange={(v) => set("bgIntensity", v)}
                      track={<span className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, transparent, ${tint})` }} />}
                    />

                    {/* Image de fond ou bandeau */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("callout.backgroundImageLabel")}</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={imageUploading || !onUploadIconImage}
                          onClick={() => onUploadIconImage && imageFileInputRef.current?.click()}
                          title={!onUploadIconImage ? t("callout.imageDisabled") : undefined}
                          className="min-w-0 flex-1 justify-start px-3 has-[>svg]:px-3 disabled:pointer-events-auto disabled:cursor-not-allowed"
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
                        {state.image && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={tCommon("remove")}
                            className="size-9 hover:text-destructive"
                            onClick={() => set("image", "")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => upload(e, setImageUploading, (url) => set("image", url))}
                      />
                    </div>
                    {state.image && (
                      <div className="grid items-end gap-4 sm:grid-cols-2">
                        <ChoiceGroup<CalloutImageMode>
                          label={t("callout.imageModeLabel")}
                          value={resolved.imageMode}
                          onChange={(v) => setState((s) => ({ ...s, imageMode: v, imageVeil: undefined }))}
                          options={[
                            { value: "background", label: t("callout.imageModeBackground") },
                            { value: "banner", label: t("callout.imageModeBanner") },
                          ]}
                        />
                        {/* La piste montre l'image, de plus en plus voilée vers la droite. */}
                        <PercentSlider
                          label={t("callout.imageVeilLabel")}
                          value={resolved.imageVeil}
                          onChange={(v) => set("imageVeil", v)}
                          track={
                            <>
                              <StoredImage url={state.image} width={480} height={36} resize="cover" className="object-cover" />
                              <span className="absolute inset-0 bg-linear-to-r from-transparent to-background" />
                            </>
                          }
                        />
                        <p className="text-xs text-muted-foreground sm:col-span-2">{t("callout.imageVeilHint")}</p>
                      </div>
                    )}
                  </section>
                )}
              </TabsContent>

              {/* ── Mise en page ── */}
              <TabsContent value="layout" className="space-y-7 p-5">
                <section className="space-y-4">
                  <SectionLabel>{t("callout.placementLabel")}</SectionLabel>
                  <ChoiceGroup<CalloutAlign>
                    label={t("callout.alignLabel")}
                    value={align}
                    onChange={(v) => set("align", v)}
                    options={[
                      { value: "left", label: t("callout.alignLeft"), preview: <AlignLeft className="h-4 w-4" /> },
                      { value: "center", label: t("callout.alignCenter"), preview: <AlignCenter className="h-4 w-4" /> },
                      { value: "right", label: t("callout.alignRight"), preview: <AlignRight className="h-4 w-4" /> },
                    ]}
                  />
                  <ChoiceGroup<CalloutWidth>
                    label={t("callout.widthLabel")}
                    value={resolved.width}
                    onChange={(v) => set("width", v)}
                    options={[
                      { value: "full", label: t("callout.widthFull"), preview: widthSample(100) },
                      { value: "medium", label: t("callout.sizeMedium"), preview: widthSample(65) },
                      { value: "narrow", label: t("callout.widthNarrow"), preview: widthSample(38) },
                    ]}
                  />
                </section>

                {!separator && (
                  <section className="space-y-4">
                    <SectionLabel>{t("callout.iconLabel")}</SectionLabel>
                    <ChoiceGroup<CalloutIconPosition>
                      label={t("callout.iconPositionLabel")}
                      value={resolved.iconPosition}
                      onChange={(v) => setState((s) => ({ ...s, iconPosition: v, iconSize: undefined }))}
                      options={(["inline", "side", "top"] as const).map((v) => ({
                        value: v,
                        label: t(`callout.icon${v[0].toUpperCase()}${v.slice(1)}`),
                        preview: iconPositionSample(v),
                      }))}
                    />
                    <ChoiceGroup<CalloutIconSize>
                      label={t("callout.iconSizeLabel")}
                      value={resolved.iconSize}
                      onChange={(v) => set("iconSize", v)}
                      options={[
                        { value: "small", label: t("callout.sizeSmall"), preview: <span className="block h-2 w-2 rounded-xs bg-current" /> },
                        { value: "medium", label: t("callout.sizeMedium"), preview: <span className="block h-3.5 w-3.5 rounded-xs bg-current" /> },
                        { value: "large", label: t("callout.sizeLarge"), preview: <span className="block h-5 w-5 rounded-sm bg-current" /> },
                      ]}
                    />
                  </section>
                )}

                <section className="space-y-4">
                  <SectionLabel>{t("callout.typographyLabel")}</SectionLabel>
                  <ChoiceGroup<CalloutFont>
                    label={t("callout.titleFontLabel")}
                    value={resolved.titleFont}
                    onChange={(v) => set("titleFont", v)}
                    options={[
                      { value: "inherit", label: t("callout.fontInherit"), preview: <span className="text-base font-semibold">Aa</span> },
                      { value: "serif", label: t("callout.fontSerif"), preview: <span className="font-message-serif text-base font-semibold">Aa</span> },
                      { value: "mono", label: t("callout.fontMono"), preview: <span className="font-mono text-base font-semibold">Aa</span> },
                      { value: "hand", label: t("callout.fontHand"), preview: <span className="font-message-hand text-xl leading-none">Aa</span> },
                    ]}
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("callout.textStyleLabel")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={state.titleSmallCaps}
                        aria-label={t("callout.titleSmallCaps")}
                        onClick={() => set("titleSmallCaps", !state.titleSmallCaps)}
                        className={cn(choiceClass(state.titleSmallCaps), "py-2")}
                      >
                        <span className="[font-variant-caps:small-caps]">{t("callout.titleSmallCaps")}</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={state.bodyItalic}
                        aria-label={t("callout.bodyItalic")}
                        onClick={() => set("bodyItalic", !state.bodyItalic)}
                        className={cn(choiceClass(state.bodyItalic), "py-2")}
                      >
                        <span className="italic">{t("callout.bodyItalic")}</span>
                      </button>
                    </div>
                  </div>
                </section>
              </TabsContent>
            </ScrollArea>
          </Tabs>
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
