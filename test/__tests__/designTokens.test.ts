import { describe, it, expect } from "vitest";

import { workingSources } from "@/test/sourceFiles";

/**
 * Les règles du système de design (app/globals.css), vérifiées dans le code.
 *
 * Chaque écran reprenait la palette de Tailwind ou une valeur en pixels au
 * lieu d'un jeton : trois verts pour dire « en ligne », sept compteurs
 * rouges, onze tailles de texte. Ce contrôle refuse ces écarts à l'écriture.
 *
 * Une exception assumée porte `design-allow` en commentaire sur sa ligne,
 * avec sa raison.
 */

const SOURCES = workingSources(["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx", "components/**/*.ts", "hooks/**/*.ts", "hooks/**/*.tsx"]).filter(
  ({ file }) => !/(__tests__|\.test\.|\.spec\.)/.test(file),
);

// `zinc` reste permis : la palette de l'application en est tirée, une
// variante de zinc est la seule sortie admise quand aucun jeton ne convient.
const PALETTE = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|neutral|stone";

const RULES: { name: string; pattern: RegExp; hint: string }[] = [
  {
    name: "couleur de la palette Tailwind",
    pattern: new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|outline|divide|decoration|caret|shadow|placeholder)-(?:${PALETTE})-\d{2,3}\b`),
    hint: "un jeton (success, warning, info, destructive, npc, online, away, offline, accent, muted…) ou, à défaut, une variante de zinc",
  },
  {
    name: "couleur arbitraire dans une classe",
    pattern: /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|shadow)-\[(?:#|rgb|hsl|oklch)/,
    hint: "un jeton de app/globals.css",
  },
  {
    name: "hsl(var(--…)) : les jetons ne sont pas des triplets HSL",
    pattern: /hsl\(var\(--/,
    hint: "var(--x) directement, ou la classe du jeton",
  },
  {
    name: "variante dark: (l'application n'a qu'un thème)",
    pattern: /(?<![\w-])dark:[\w[]/,
    hint: "garder la seule valeur sombre, sans préfixe",
  },
  {
    name: "taille de texte en pixels",
    pattern: /(?<![\w-])(?:[\w-]+:)*text-\[\d[\d.]*(?:px|rem|em)\]/,
    hint: "text-2xs (10), text-xs-plus (11), text-xs (12), text-sm (14)…",
  },
  {
    name: "gris de texte en opacité",
    pattern: /(?<![\w:-])(?:(?!placeholder:)[\w-]+:)*text-(?:muted-)?foreground\/\d+/,
    hint: "text-foreground ou text-muted-foreground, rien entre les deux",
  },
  {
    name: "z-index arbitraire",
    pattern: /(?<![\w-])(?:[\w-]+:)*z-\[\d+\]/,
    hint: "z-0 à z-20 dans un composant ; z-floating, z-modal, z-modal-raised, z-popover, z-lightbox au-delà",
  },
  {
    name: "rayon hors échelle",
    pattern: /(?<![\w-])(?:[\w-]+:)*rounded(?:-[trblse]{1,2})?-\[\d[\d.]*px\]/,
    hint: "rounded-xs (2), sm (6), md (8), lg (10), xl (14), 2xl, full",
  },
  {
    name: "accent sur l'élément actif d'une liste ou d'un menu",
    pattern: /(?:focus|data-\[selected=true\]|data-\[highlighted\]|data-\[state=open\]):(?:bg-accent|text-accent-foreground)(?![\w/-])/,
    hint: "l'accent est le rouge de la marque, pas le survol de shadcn : bg-muted text-foreground",
  },
  {
    name: "ancien nom de couleur",
    pattern: /(?<![\w-])(?:[\w-]+:)*[a-z]+-(?:body|hoverCard|card-400|hover-400|border-soft|mist-\d+|carbon-\d+|brand-[a-z]+)\b|var\(--(?:color-)?(?:body|hover-card|card-400|hover-400|border-soft|mist-\d+|carbon-\d+)\)/,
    hint: "canvas, card, muted, border, foreground, muted-foreground",
  },
];

function violations(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const { file, source } of SOURCES) {
    source.split("\n").forEach((line, i) => {
      if (line.includes("design-allow")) return;
      if (pattern.test(line)) out.push(`${file}:${i + 1}  ${line.trim().slice(0, 140)}`);
    });
  }
  return out;
}

describe("système de design", () => {
  it("parcourt bien le code", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
  });

  for (const rule of RULES) {
    it(`pas de ${rule.name} — ${rule.hint}`, () => {
      expect(violations(rule.pattern)).toEqual([]);
    });
  }
});
