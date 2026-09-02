"use client";

import { useTranslations } from "next-intl";
import type { WikiHeading } from "@/lib/wikiToc";

/**
 * Sommaire flottant à droite du contenu, masqué en dessous de deux titres.
 *
 * Il ne réapparaît qu'à partir de `2xl`. En dessous, la place se compte : rail
 * des mondes, navigation du monde, arbre des pages et colonne latérale se
 * partagent déjà la largeur, et le sommaire réduisait le texte de l'article à
 * 151 px sur un écran de 1280 — mesuré. C'est une aide à la navigation, pas le
 * contenu : elle cède la place avant lui.
 */
export function WikiTableOfContents({ headings }: { headings: WikiHeading[] }) {
  const t = useTranslations("wiki");

  if (headings.length < 2) return null;

  return (
    <nav className="hidden w-48 shrink-0 2xl:block" aria-label={t("tocTitle")}>
      <div className="sticky top-6 border-l border-border-soft pl-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tocTitle")}
        </p>
        <ul className="space-y-1 text-sm">
          {headings.map(h => (
            <li key={h.id} style={{ paddingLeft: `${(h.level - 1) * 0.75}rem` }}>
              <a
                href={`#${h.id}`}
                className="block truncate text-muted-foreground hover:text-foreground hover:underline"
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
