"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { TimelineItem } from "@/types/personas";

/**
 * Chronologie en lecture seule d'une fiche de persona.
 *
 * Ces deux composants existaient en double — une fois dans `PersonaProfileSheet`
 * (fiche ouverte depuis un salon), une fois dans `PersonaProfileSheetTrigger`
 * sous le préfixe `Trigger`. Les corps étaient identiques au caractère près, à
 * un `React.useState` contre `useState` près.
 *
 * Les libellés du bouton étaient codés en dur en français (« Voir » /
 * « Réduire »), donc affichés tels quels aux comptes anglophones et
 * hispanophones ; ils passent par `common.show` / `common.collapse`.
 */

function TimelineItemRow({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  const tCommon = useTranslations("common");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/50" />
        {!isLast && <div className="flex-1 w-px bg-border mt-1" />}
      </div>
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-baseline gap-2">
          {item.date && (
            <span className="text-[0.65rem] text-muted-foreground shrink-0">{item.date}</span>
          )}
          <span className="text-sm font-medium leading-tight">{item.title}</span>
          {item.description && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto shrink-0 text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? tCommon("collapse") : tCommon("show")}
            </button>
          )}
        </div>
        {expanded && item.description && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.description}</p>
        )}
      </div>
    </div>
  );
}

export function PersonaTimelineView({ items }: { items: TimelineItem[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <TimelineItemRow key={item.id} item={item} isLast={i === items.length - 1} />
      ))}
    </div>
  );
}
