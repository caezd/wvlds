"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import { libelleRaccourci, type NomFormat } from "@/lib/markdownFormatting";
import { cn } from "@/lib/utils";

type Outil = {
  nom: NomFormat;
  Icone: React.ComponentType<{ className?: string }>;
  /** Clé de traduction dans `common`, partagée avec le composeur de salon. */
  cle: string;
};

/**
 * Outils par familles, séparées à l'écran par un filet.
 *
 * L'ordre suit celui des barres d'outils usuelles — structure, puis caractère,
 * puis liens, puis blocs — pour que la main sache où aller sans lire.
 */
const GROUPES: Outil[][] = [
  [
    { nom: "h1", Icone: Heading1, cle: "formatHeading1" },
    { nom: "h2", Icone: Heading2, cle: "formatHeading2" },
    { nom: "h3", Icone: Heading3, cle: "formatHeading3" },
  ],
  [
    { nom: "bold", Icone: Bold, cle: "formatBold" },
    { nom: "italic", Icone: Italic, cle: "formatItalic" },
    { nom: "underline", Icone: Underline, cle: "formatUnderline" },
    { nom: "strike", Icone: Strikethrough, cle: "formatStrikethrough" },
    { nom: "code", Icone: Code, cle: "formatCode" },
  ],
  [{ nom: "link", Icone: Link2, cle: "formatLink" }],
  [
    { nom: "bullet", Icone: List, cle: "formatList" },
    { nom: "ordered", Icone: ListOrdered, cle: "formatOrderedList" },
    { nom: "quote", Icone: Quote, cle: "formatQuote" },
  ],
];

/**
 * Ceinture d'outils de mise en forme du wiki.
 *
 * Elle vit dans le sous-en-tête plutôt qu'au-dessus du champ : le sous-en-tête
 * est déjà aligné sur la colonne du texte, et une seconde barre juste en
 * dessous aurait mangé la hauteur qui revient à l'article.
 */
export function WikiFormatToolbar({
  onFormat,
  className,
}: {
  onFormat: (nom: NomFormat) => void;
  className?: string;
}) {
  const t = useTranslations("common");

  // Rendu identique au serveur et au premier rendu client — la plateforme
  // n'est connue qu'ensuite, et l'infobulle se corrige alors sans que rien ne
  // saute : elle n'apparaît qu'au survol.
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  return (
    <div
      role="toolbar"
      aria-label={t("formatToolbar")}
      className={cn(
        "flex items-center justify-center gap-0.5 overflow-x-auto [scrollbar-width:none]",
        className,
      )}
    >
      {GROUPES.map((groupe, i) => (
        <React.Fragment key={groupe[0].nom}>
          {i > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />}
          {groupe.map(({ nom, Icone, cle }) => {
            const libelle = t(cle);
            return (
              <button
                key={nom}
                type="button"
                aria-label={libelle}
                title={`${libelle} · ${libelleRaccourci(nom, mac)}`}
                // Le champ garde le focus, donc sa sélection : c'est elle que
                // l'action va lire. Sans cela, cliquer un bouton la perdrait
                // avant même que l'action ne s'exécute.
                onMouseDown={e => e.preventDefault()}
                onClick={() => onFormat(nom)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icone className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
