"use client";

import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";

import type { PinSearchHit } from "@/lib/wikiSearch";

/**
 * Les lieux de la carte qui répondent à la recherche libre.
 *
 * Le centre de recherche fouillait les messages puis le wiki ; la carte, elle,
 * restait muette — un lieu ne se retrouvait qu'en la promenant à l'œil. Ses
 * résultats viennent après ceux du wiki et avant les messages : peu nombreux,
 * et l'adresse sait ouvrir la carte sur l'épingle exacte.
 */
export function SearchMapResults({
  hits,
  onSelect,
}: {
  hits: PinSearchHit[];
  onSelect: (hit: PinSearchHit) => void;
}) {
  const t = useTranslations("chatrooms");
  if (hits.length === 0) return null;

  return (
    <section className="mb-4" aria-label={t("search.mapResults")}>
      <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("search.mapResults")}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {hits.map((hit) => (
          <li key={hit.pinId}>
            <button
              type="button"
              onClick={() => onSelect(hit)}
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
            >
              <span className="flex items-center gap-1.5 text-sm">
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                {hit.title}
              </span>
              {hit.excerpt && (
                <span className="line-clamp-1 text-xs text-muted-foreground/80">{hit.excerpt}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
