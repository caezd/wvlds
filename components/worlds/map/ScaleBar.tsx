"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDistance, scaleBarFor } from "./scale";

/**
 * La barre d'échelle, dans un coin du cadre : un trait et ce qu'il vaut.
 *
 * Hors de l'enveloppe transformée — elle ne bouge pas avec la carte — et
 * recalculée à la fin de chaque geste, quand l'échelle courante est connue.
 * Un nombre rond d'unités, toujours : c'est le trait qui s'adapte.
 */
export function ScaleBar({ pxPerUnit, unit }: { pxPerUnit: number; unit: string }) {
  const t = useTranslations("map");
  const locale = useLocale();
  const barre = scaleBarFor(pxPerUnit);
  if (!barre) return null;

  const libelle = formatDistance(barre.units, unit, locale);
  return (
    <div
      role="img"
      aria-label={t("scaleBar", { distance: libelle })}
      className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col gap-0.5 rounded-md bg-background/80 px-1.5 py-1 text-[10px] font-medium leading-none text-foreground shadow backdrop-blur-sm"
    >
      <span>{libelle}</span>
      <div data-scale-bar style={{ width: barre.px }} className="h-1.5 border-x-2 border-b-2 border-foreground/80" />
    </div>
  );
}
