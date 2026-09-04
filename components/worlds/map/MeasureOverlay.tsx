"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type { Point } from "./zoom";
import { midpoint } from "./zoom";
import {
  calibrateWidthUnits,
  distanceBetween,
  formatDistance,
  roundDistance,
  type MapScale,
} from "./scale";

/**
 * La règle : un segment tracé sur la carte, et ce qu'il mesure.
 *
 * Se rend DANS l'enveloppe transformée, comme les épingles : le trait suit
 * donc le déplacement et l'agrandissement sans un calcul. Le SVG est étiré
 * sur toute l'enveloppe (`preserveAspectRatio="none"`) pour que ses
 * coordonnées soient les pourcentages des épingles ; `non-scaling-stroke`
 * garde le trait à la même épaisseur quelle que soit l'échelle, et quel que
 * soit l'étirement. Les extrémités et le libellé sont du HTML à contre-échelle,
 * comme les marqueurs.
 *
 * En édition, le libellé est un formulaire : on mesure une distance connue,
 * on dit combien elle fait, et la carte en déduit son échelle. C'est le seul
 * réglage — nul besoin de connaître des pixels.
 */
export function MeasureOverlay({
  a,
  b,
  aspect,
  scale,
  isEditMode,
  onCalibrate,
  onClear,
}: {
  a: Point;
  /** Absent tant que le second point n'est pas posé. */
  b: Point | null;
  /** Hauteur / largeur de la carte. */
  aspect: number;
  scale: MapScale | null;
  isEditMode: boolean;
  /** `null` retire l'échelle. */
  onCalibrate: (widthUnits: number | null, unit: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const distance = b && scale ? distanceBetween(a, b, aspect, scale) : null;
  const centre = b ? midpoint(a, b) : a;

  // Le brouillon repart de la mesure courante à chaque nouveau segment : ce
  // qu'on corrige, c'est ce que la carte croit.
  const [valueDraft, setValueDraft] = React.useState("");
  const [unitDraft, setUnitDraft] = React.useState("");
  const segmentKey = b ? `${a.x},${a.y},${b.x},${b.y}` : "";
  const [draftKey, setDraftKey] = React.useState("");
  if (draftKey !== segmentKey) {
    setDraftKey(segmentKey);
    setValueDraft(distance != null ? String(roundDistance(distance)) : "");
    setUnitDraft(scale?.unit ?? "");
  }

  function submit() {
    if (!b) return;
    const valeur = Number(valueDraft.replace(",", "."));
    if (valueDraft.trim() === "") {
      onCalibrate(null, "");
      return;
    }
    const largeur = calibrateWidthUnits(a, b, aspect, valeur);
    if (largeur == null) return;
    onCalibrate(largeur, unitDraft.trim());
  }

  // Le formulaire et le bouton vivent sur la carte : leurs clics ne doivent
  // ni poser un point ni entamer un déplacement.
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <>
      {b && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" className="stroke-white/90" strokeWidth={5} strokeLinecap="round" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" className="stroke-primary" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 4" />
        </svg>
      )}

      {[a, b].map((p, i) =>
        p ? (
          <div
            key={i}
            data-measure-point
            className="pointer-events-none absolute z-20 h-3 w-3 rounded-full border-2 border-white bg-primary shadow"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
              transformOrigin: "center center",
            }}
          />
        ) : null,
      )}

      <div
        data-measure-label
        className="absolute z-30"
        style={{
          left: `${centre.x}%`,
          top: `${centre.y}%`,
          transform: "translate(-50%, calc(-100% - 10px)) scale(var(--pin-inv-scale, 1))",
          transformOrigin: "center bottom",
        }}
        {...stop}
      >
        <div className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1 text-xs shadow-xl">
          {!b ? (
            <span className="text-muted-foreground">{t("measureHint")}</span>
          ) : isEditMode ? (
            <>
              <span className="text-muted-foreground">{t("scaleDeclare")}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-label={t("scaleDeclare")}
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                className="w-20 rounded-md border border-border-soft bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                aria-label={t("scaleUnit")}
                placeholder="km"
                maxLength={16}
                value={unitDraft}
                onChange={(e) => setUnitDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                className="w-12 rounded-md border border-border-soft bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                aria-label={tCommon("save")}
                onClick={submit}
                className="rounded p-0.5 text-primary hover:bg-primary/10"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <span className={distance == null ? "text-muted-foreground" : "font-medium"}>
              {distance != null && scale ? formatDistance(distance, scale.unit, locale) : t("noScale")}
            </span>
          )}
          {b && (
            <button
              type="button"
              aria-label={t("clearMeasure")}
              onClick={onClear}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
