import type {
  CalloutAlign,
  CalloutBlock,
  CalloutBorder,
  CalloutBorderStyle,
  CalloutBorderWidth,
  CalloutFont,
  CalloutIconPosition,
  CalloutIconSize,
  CalloutImageMode,
  CalloutRadius,
  CalloutSide,
  CalloutWidth,
} from "@/lib/chat-blocks";

/**
 * Le style d'un encadré, chaque réglage résolu : la valeur écrite dans le
 * bloc, sinon celle qu'il avait avant que le réglage existe. Un encadré
 * envoyé avant l'arrivée des côtés, de l'épaisseur ou de l'intensité du fond
 * se lit donc exactement comme avant.
 */
export type ResolvedCalloutStyle = {
  separator: boolean;
  sides: CalloutSide[];
  borderWidth: CalloutBorderWidth;
  borderStyle: CalloutBorderStyle;
  radius: CalloutRadius;
  /** Couleur CSS de la bordure ; absente = la bordure neutre du thème. */
  borderColor?: string;
  titleColor?: string;
  bgColor?: string;
  bgIntensity: number;
  imageMode: CalloutImageMode;
  imageVeil: number;
  align: CalloutAlign;
  width: CalloutWidth;
  iconPosition: CalloutIconPosition;
  iconSize: CalloutIconSize;
  titleFont: CalloutFont;
  titleSmallCaps: boolean;
  bodyItalic: boolean;
  collapsible: boolean;
};

export const CALLOUT_SIDES: CalloutSide[] = ["top", "right", "bottom", "left"];
export const CALLOUT_BORDER_WIDTHS: CalloutBorderWidth[] = ["thin", "medium", "thick"];
export const CALLOUT_BORDER_STYLES: CalloutBorderStyle[] = ["solid", "dashed", "dotted", "double"];
export const CALLOUT_RADII: CalloutRadius[] = ["none", "soft", "round"];
export const CALLOUT_WIDTHS: CalloutWidth[] = ["full", "medium", "narrow"];
export const CALLOUT_ALIGNS: CalloutAlign[] = ["left", "center", "right"];
export const CALLOUT_ICON_POSITIONS: CalloutIconPosition[] = ["inline", "side", "top"];
export const CALLOUT_ICON_SIZES: CalloutIconSize[] = ["small", "medium", "large"];
export const CALLOUT_FONTS: CalloutFont[] = ["inherit", "serif", "mono", "hand"];
export const CALLOUT_IMAGE_MODES: CalloutImageMode[] = ["background", "banner"];

/** Paliers du voile proposés par la fenêtre (en %). */
export const CALLOUT_IMAGE_VEILS = [0, 25, 50, 75] as const;

/** Épaisseur et arrondi en pixels, pour le rendu. */
export const CALLOUT_BORDER_WIDTH_PX: Record<CalloutBorderWidth, number> = { thin: 1, medium: 2, thick: 4 };
export const CALLOUT_RADIUS_PX: Record<CalloutRadius, number> = { none: 0, soft: 8, round: 18 };

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function percent(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

function sidesOf(border: CalloutBorder): CalloutSide[] {
  if (border === "left") return ["left"];
  if (border === "none" || border === "separator") return [];
  return [...CALLOUT_SIDES];
}

const isLeftOnly = (sides: CalloutSide[]) => sides.length === 1 && sides[0] === "left";

/** Le style de bordure à écrire pour des côtés donnés (lu par les anciennes versions). */
export function bordersFromSides(sides: CalloutSide[]): Exclude<CalloutBorder, "separator"> {
  if (sides.length === 0) return "none";
  if (isLeftOnly(sides)) return "left";
  return "full";
}

export function resolveCalloutStyle(block: CalloutBlock): ResolvedCalloutStyle {
  const border = oneOf(block.border, ["full", "left", "separator", "none"] as const, "full");
  const sides = Array.isArray(block.sides)
    ? CALLOUT_SIDES.filter((side) => block.sides!.includes(side))
    : sidesOf(border);
  const accent = block.accent || undefined;
  const iconPosition = oneOf(block.iconPosition, CALLOUT_ICON_POSITIONS, "inline");
  const imageMode = oneOf(block.imageMode, CALLOUT_IMAGE_MODES, "background");

  return {
    separator: border === "separator",
    sides,
    borderWidth: oneOf(block.borderWidth, CALLOUT_BORDER_WIDTHS, isLeftOnly(sides) ? "thick" : "thin"),
    borderStyle: oneOf(block.borderStyle, CALLOUT_BORDER_STYLES, "solid"),
    radius: oneOf(block.radius, CALLOUT_RADII, block.rounded === false ? "none" : "soft"),
    borderColor: block.borderColor
      || (accent && (isLeftOnly(sides) ? accent : `color-mix(in srgb, ${accent} 28%, transparent)`))
      || undefined,
    titleColor: block.titleColor || accent,
    bgColor: block.bgColor || accent,
    bgIntensity: percent(block.bgIntensity, sides.length === 0 ? 0 : 8),
    imageMode,
    // Le texte se lit par-dessus une image de fond, pas sur un bandeau.
    imageVeil: percent(block.imageVeil, imageMode === "banner" ? 0 : 50),
    align: oneOf(block.align, CALLOUT_ALIGNS, "left"),
    width: oneOf(block.width, CALLOUT_WIDTHS, "full"),
    iconPosition,
    iconSize: oneOf(block.iconSize, CALLOUT_ICON_SIZES, iconPosition === "inline" ? "small" : "large"),
    titleFont: oneOf(block.titleFont, CALLOUT_FONTS, "inherit"),
    titleSmallCaps: block.titleSmallCaps === true,
    bodyItalic: block.bodyItalic === true,
    collapsible: block.collapsible === true,
  };
}

/** Les réglages qui ne s'écrivent que s'ils changent le rendu. */
const STYLE_KEYS = [
  "sides", "borderWidth", "borderStyle", "rounded", "radius",
  "titleColor", "borderColor", "bgColor", "bgIntensity", "imageMode", "imageVeil",
  "width", "iconPosition", "iconSize", "titleFont", "titleSmallCaps", "bodyItalic", "collapsible",
] as const;

/**
 * Retire du bloc les réglages égaux à leur valeur par défaut : le JSON d'un
 * encadré reste court, et un encadré sans réglage particulier s'écrit comme
 * avant leur arrivée.
 */
export function compactCallout(block: CalloutBlock): CalloutBlock {
  const out: CalloutBlock = { ...block };
  const fingerprint = (b: CalloutBlock) => JSON.stringify(resolveCalloutStyle(b));
  for (const key of STYLE_KEYS) {
    if (!(key in out)) continue;
    const without: CalloutBlock = { ...out };
    delete without[key];
    if (out[key] === undefined || fingerprint(without) === fingerprint(out)) {
      delete out[key];
    }
  }
  return out;
}
