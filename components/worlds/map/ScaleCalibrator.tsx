"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type { Point } from "./zoom";
import { midpoint } from "./zoom";
import { calibrateWidthUnits, distanceBetween, roundDistance, type MapScale } from "./scale";

/**
 * Régler l'échelle d'une carte : on trace un segment sur une distance connue,
 * on dit ce qu'elle vaut, et la carte en déduit ce que vaut sa largeur.
 *
 * Le segment ne mesure pas : une échelle sert à donner l'ordre de grandeur
 * d'un monde, pas à faire des relevés entre deux points, et ce qu'elle produit
 * se lit dans la barre d'échelle, en bas du cadre.
 *
 * Le même outil sert à joindre deux lieux (voir migration 166) : c'est
 * `WorldMap` qui tranche, selon que les points cliqués se sont accrochés à des
 * épingles ou non. Ce composant n'en voit que `anchoredToPin`, qui change
 * l'indice donné avant le second clic.
 *
 * Se rend DANS l'enveloppe transformée, comme les épingles : le trait suit
 * donc le déplacement et l'agrandissement sans un calcul. Le SVG est étiré
 * sur toute l'enveloppe (`preserveAspectRatio="none"`) pour que ses
 * coordonnées soient les pourcentages des épingles ; `non-scaling-stroke`
 * garde le trait à la même épaisseur quel que soit l'étirement. Les
 * extrémités et le formulaire sont du HTML à contre-échelle, comme les
 * marqueurs.
 */
export function ScaleCalibrator({
  a,
  b,
  anchoredToPin = false,
  aspect,
  scale,
  onCalibrate,
  onClear,
}: {
  a: Point;
  /** Absent tant que le second point n'est pas posé. */
  b: Point | null;
  /** Le premier point s'est accroché à un lieu : en cliquer un second les relie. */
  anchoredToPin?: boolean;
  /** Hauteur / largeur de la carte. */
  aspect: number;
  /** L'échelle actuelle, s'il y en a une : c'est elle qu'on corrige. */
  scale: MapScale | null;
  /** `null` retire l'échelle. */
  onCalibrate: (widthUnits: number | null, unit: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");

  const centre = b ? midpoint(a, b) : a;

  // Le brouillon repart de ce que la carte croit, à chaque nouveau segment :
  // on corrige une échelle plus souvent qu'on n'en pose une.
  const [valueDraft, setValueDraft] = React.useState("");
  const [unitDraft, setUnitDraft] = React.useState("");
  const segmentKey = b ? `${a.x},${a.y},${b.x},${b.y}` : "";
  const [draftKey, setDraftKey] = React.useState("");
  if (draftKey !== segmentKey) {
    setDraftKey(segmentKey);
    const connue = b && scale ? distanceBetween(a, b, aspect, scale) : null;
    setValueDraft(connue != null ? String(roundDistance(connue)) : "");
    setUnitDraft(scale?.unit ?? "");
  }

  function submit() {
    if (!b) return;
    if (valueDraft.trim() === "") {
      onCalibrate(null, "");
      return;
    }
    const valeur = Number(valueDraft.replace(",", "."));
    const largeur = calibrateWidthUnits(a, b, aspect, valeur);
    if (largeur == null) return;
    onCalibrate(largeur, unitDraft.trim());
  }

  // Le formulaire vit sur la carte : ses clics ne doivent ni poser un point
  // ni entamer un déplacement.
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
            data-scale-point
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
        data-scale-form
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
            <span className="text-muted-foreground">{anchoredToPin ? t("linkHint") : t("scaleHint")}</span>
          ) : (
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
          )}
          <button
            type="button"
            aria-label={t("clearSegment")}
            onClick={onClear}
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
