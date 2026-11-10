"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type ColorPreset = { label: string; value: string };

/** La palette du sélecteur : noir, six teintes vives, blanc. */
export const DEFAULT_COLOR_PRESETS: ColorPreset[] = [
  { label: "Noir",   value: "#18181b" },
  { label: "Rouge",  value: "#e8553a" },
  { label: "Orange", value: "#f27a12" },
  { label: "Jaune",  value: "#fbc02d" },
  { label: "Vert",   value: "#5fcf5a" },
  { label: "Bleu",   value: "#47b3f2" },
  { label: "Violet", value: "#6b3cf5" },
  { label: "Blanc",  value: "#e4e4e7" },
];

export const ACCENT_COLOR_PRESETS: ColorPreset[] = [
  { label: "Gris",   value: "#9aa0a6" },
  { label: "Rouge",  value: "#F56868" },
  { label: "Orange", value: "#FF8C42" },
  { label: "Jaune",  value: "#F1DF38" },
  { label: "Vert",   value: "#8AE06C" },
  { label: "Teal",   value: "#2DD4BF" },
  { label: "Bleu",   value: "#60A5FA" },
  { label: "Violet", value: "#A77DFF" },
  { label: "Rose",   value: "#FF6B9D" },
  { label: "Ambre",  value: "#f59e0b" },
];

// ── Conversions ──────────────────────────────────────────────────────────────

export type Rgba = { r: number; g: number; b: number; a: number };
export type Hsva = { h: number; s: number; v: number; a: number };

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Lit `#rgb`, `#rgba`, `#rrggbb` ou `#rrggbbaa` (canaux 0-255, alpha 0-1). */
export function parseHexColor(hex: string): Rgba | null {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
  const channel = (i: number) => parseInt(digits.slice(i, i + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: digits.length === 8 ? channel(6) / 255 : 1,
  };
}

function toHexPair(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
}

/** `#rrggbb`, ou `#rrggbbaa` si `withAlpha` et que la couleur n'est pas opaque. */
export function rgbaToHex({ r, g, b, a }: Rgba, withAlpha = false): string {
  const base = "#" + toHexPair(r) + toHexPair(g) + toHexPair(b);
  const alphaPair = toHexPair(a * 255);
  return withAlpha && alphaPair !== "ff" ? base + alphaPair : base;
}

/** Forme canonique d'une couleur hex (minuscules, six ou huit chiffres), ou null. */
export function normalizeHexColor(hex: string, withAlpha = false): string | null {
  const rgba = parseHexColor(hex);
  return rgba ? rgbaToHex(rgba, withAlpha) : null;
}

function rgbaToHsva({ r, g, b, a }: Rgba): Hsva {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  // Teinte non arrondie : l'aller-retour hex → HSV → hex doit être exact.
  return { h: h * 360, s: max === 0 ? 0 : d / max, v: max, a };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s, hp = (h % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hexToHsva(hex: string): Hsva | null {
  const rgba = parseHexColor(hex);
  return rgba ? rgbaToHsva(rgba) : null;
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const hsva = hexToHsva(hex);
  return hsva ? { h: hsva.h, s: hsva.s, v: hsva.v } : null;
}

export function hsvToHex(h: number, s: number, v: number): string {
  return rgbaToHex({ ...hsvToRgb(h, s, v), a: 1 });
}

export function hsvaToHex({ h, s, v, a }: Hsva, withAlpha = false): string {
  return rgbaToHex({ ...hsvToRgb(h, s, v), a }, withAlpha);
}

/** Vrai si la couleur est assez claire pour porter une marque sombre. */
function isLightColor(hex: string): boolean {
  const rgba = parseHexColor(hex);
  if (!rgba) return false;
  return 0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b > 160;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const FALLBACK_HSVA: Hsva = { h: 220, s: 0.85, v: 0.85, a: 1 };

const HUE_GRADIENT = "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";
// Damier sous le curseur d'opacité, tiré des jetons pour suivre le thème.
const CHECKERBOARD =
  "repeating-conic-gradient(color-mix(in oklch, var(--muted-foreground) 30%, var(--popover)) 0% 25%, var(--popover) 0% 50%)";

/** Pastille ronde évidée des curseurs (anneau blanc, cœur à la couleur). */
const THUMB_CLASS =
  "pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgb(0_0_0/0.15),0_1px_3px_rgb(0_0_0/0.35)]";

// ── Composant ────────────────────────────────────────────────────────────────

/**
 * Sélecteur de couleur : une rangée de pastilles, puis une zone
 * saturation/luminosité, un curseur de teinte, un curseur d'opacité (si
 * `alpha`) et un champ hexadécimal. `presets={[]}` retire la rangée.
 *
 * `alpha` ajoute le curseur d'opacité : une couleur non opaque sort en
 * `#rrggbbaa`, une couleur opaque en `#rrggbb`. La base l'accepte depuis la
 * migration 203 (`is_hex_color`, `hexColorSchema`) ; pour teinter une couleur
 * enregistrée, passer par `withOpacity` (lib/colorOpacity.ts), jamais par un
 * suffixe accolé au code.
 *
 * `framed` dessine le panneau (bord, fond, arrondi) ; dans un Popover qui le
 * dessine déjà, passer `framed={false}`.
 */
export function HsvColorPicker({
  color,
  onChange,
  presets = DEFAULT_COLOR_PRESETS,
  alpha = false,
  framed = true,
  className,
}: {
  color: string;
  onChange: (hex: string) => void;
  presets?: ColorPreset[];
  alpha?: boolean;
  framed?: boolean;
  className?: string;
}) {
  const t = useTranslations("colorPicker");

  const [hsva, setHsva] = useState<Hsva>(() => hexToHsva(color) ?? FALLBACK_HSVA);
  // L'état HSV est gardé en interne : une couleur grise ou noire n'a pas de
  // teinte en hex, et la recalculer depuis la prop ramènerait la teinte à 0.
  // On ne le resynchronise que si la prop change pour une autre couleur.
  const [syncedColor, setSyncedColor] = useState(color);
  let current = hsva;
  if (color !== syncedColor) {
    setSyncedColor(color);
    const parsed = hexToHsva(color);
    if (parsed && normalizeHexColor(color, alpha) !== hsvaToHex(hsva, alpha)) {
      setHsva(parsed);
      current = parsed;
    }
  }

  const hsvaRef = useRef(current);
  hsvaRef.current = current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const hex = hsvaToHex(current, alpha);
  const opaqueHex = hsvaToHex({ ...current, a: 1 });

  const isActivePreset = (value: string) => normalizeHexColor(value, alpha) === hex;

  const [hexDraft, setHexDraft] = useState<string | null>(null);

  function commit(next: Hsva) {
    hsvaRef.current = next;
    setHsva(next);
    onChangeRef.current(hsvaToHex(next, alpha));
  }

  function pickPreset(value: string) {
    const parsed = hexToHsva(value);
    if (!parsed) return;
    hsvaRef.current = parsed;
    setHsva(parsed);
    // La valeur exacte du preset, pour que l'appelant puisse la comparer.
    onChangeRef.current(value);
  }

  function pickSV(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    commit({
      ...hsvaRef.current,
      s: clamp01((e.clientX - rect.left) / rect.width),
      v: clamp01(1 - (e.clientY - rect.top) / rect.height),
    });
  }

  function onSVKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.1 : 0.01;
    const { s, v } = hsvaRef.current;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    commit({ ...hsvaRef.current, s: clamp01(s + move[0]), v: clamp01(v + move[1]) });
  }

  function onHexInput(value: string) {
    setHexDraft(value);
    const digits = value.trim().replace(/^#/, "");
    const allowed = alpha ? [3, 4, 6, 8] : [3, 6];
    if (!allowed.includes(digits.length)) return;
    const parsed = hexToHsva("#" + digits);
    if (parsed) commit(parsed);
  }

  const hexDraftInvalid = hexDraft !== null && normalizeHexColor(hexDraft, alpha) === null;

  return (
    <div
      className={cn(
        "w-full overflow-hidden",
        framed && "rounded-2xl border border-border bg-popover text-popover-foreground",
        className,
      )}
    >
      {presets.length > 0 && (
        <div
          role="group"
          aria-label={t("presets")}
          className="grid auto-cols-fr grid-flow-col gap-1.5 p-2.5"
        >
          {presets.map((c) => {
            const active = isActivePreset(c.value);
            return (
              <button
                key={c.value}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={active}
                onClick={() => pickPreset(c.value)}
                className="flex aspect-square items-center justify-center rounded-md ring-1 ring-inset ring-foreground/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: c.value }}
              >
                {active && (
                  <span
                    data-testid="color-preset-active-dot"
                    className={cn("h-1.5 w-1.5 rounded-full", isLightColor(c.value) ? "bg-zinc-950" : "bg-white")}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className={cn("space-y-2.5 p-2.5", presets.length > 0 && "border-t border-border")}>
        {/* Saturation (x) × luminosité (y) */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("saturation")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(current.s * 100)}
          aria-valuetext={t("saturationValue", {
            s: Math.round(current.s * 100),
            v: Math.round(current.v * 100),
          })}
          data-testid="color-picker-sv"
          className="relative h-36 w-full cursor-crosshair touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            backgroundColor: `hsl(${current.h} 100% 50%)`,
            backgroundImage: "linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            pickSV(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) pickSV(e);
          }}
          onKeyDown={onSVKeyDown}
        >
          <span
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
            style={{ left: `${current.s * 100}%`, top: `${(1 - current.v) * 100}%` }}
          />
        </div>

        <div className={cn("flex gap-2", alpha ? "items-stretch" : "items-center")}>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 px-2">
            {/* Teinte */}
            <div className="relative h-3">
              <div className="absolute inset-0 rounded-full" style={{ background: HUE_GRADIENT }} />
              <input
                type="range"
                min={0}
                max={360}
                value={Math.round(current.h)}
                aria-label={t("hue")}
                onChange={(e) => commit({ ...hsvaRef.current, h: Number(e.target.value) })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span
                className={THUMB_CLASS}
                style={{ left: `${(current.h / 360) * 100}%`, backgroundColor: `hsl(${current.h} 100% 50%)` }}
              />
            </div>

            {/* Opacité */}
            {alpha && (
              <div className="relative h-3">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundImage: CHECKERBOARD, backgroundSize: "8px 8px" }}
                />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundImage: `linear-gradient(to right,transparent,${opaqueHex})` }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(current.a * 100)}
                  aria-label={t("opacity")}
                  onChange={(e) => commit({ ...hsvaRef.current, a: Number(e.target.value) / 100 })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span
                  className={THUMB_CLASS}
                  style={{ left: `${current.a * 100}%`, backgroundColor: opaqueHex }}
                />
              </div>
            )}
          </div>

          <input
            type="text"
            spellCheck={false}
            autoComplete="off"
            aria-label={t("hex")}
            aria-invalid={hexDraftInvalid || undefined}
            maxLength={alpha ? 9 : 7}
            value={hexDraft ?? hex.toUpperCase()}
            onFocus={(e) => {
              setHexDraft(hex.toUpperCase());
              e.currentTarget.select();
            }}
            onChange={(e) => onHexInput(e.target.value)}
            onBlur={() => setHexDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className={cn(
              "w-[5.5rem] shrink-0 rounded-lg bg-muted px-2 text-center font-mono text-xs font-medium text-muted-foreground outline-none focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive",
              alpha ? "min-h-8 self-stretch" : "h-8",
            )}
          />
        </div>
      </div>
    </div>
  );
}
