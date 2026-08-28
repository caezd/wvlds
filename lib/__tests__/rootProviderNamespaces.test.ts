import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT_PROVIDER_NAMESPACES } from "@/lib/clientMessages";

// ──────────────────────────────────────────────────────────────────────────
// Les providers montés par `app/layout.tsx` vivent AU-DESSUS du
// `NextIntlClientProvider` du groupe (protected). Le layout racine en fournit
// donc un, volontairement minimal : `ROOT_PROVIDER_NAMESPACES`.
//
// Un `useTranslations("autre")` dans l'un de ces fichiers ne lève pas une clé
// manquante : il lève « no context was found » et l'application entière cesse
// de se rendre — vérifié, `/auth/login` répondait 500. Les tests unitaires ne
// peuvent pas le voir, ils simulent next-intl.
//
// Ce test fige la contrainte là où elle s'applique.
// ──────────────────────────────────────────────────────────────────────────

/** Fichiers rendus au-dessus du provider du groupe (protected). */
const AU_DESSUS_DU_PROVIDER = [
  join("components", "providers", "AppProviders.tsx"),
  join("components", "providers", "PresenceProvider.tsx"),
  join("components", "providers", "NotificationsProvider.tsx"),
  join("components", "providers", "CurrentUserProvider.tsx"),
  join("components", "providers", "MobileSidebarProvider.tsx"),
];

const AUTORISES = new Set<string>(ROOT_PROVIDER_NAMESPACES);

describe("providers du layout racine", () => {
  it("ne lisent que les namespaces fournis par le provider racine", () => {
    const fautifs: string[] = [];

    for (const fichier of AU_DESSUS_DU_PROVIDER) {
      let source: string;
      try {
        source = readFileSync(join(process.cwd(), fichier), "utf-8");
      } catch {
        continue; // fichier renommé ou supprimé : rien à vérifier
      }
      for (const m of source.matchAll(/useTranslations\(\s*"([^"]+)"/g)) {
        const ns = m[1].split(".")[0];
        if (!AUTORISES.has(ns)) {
          const ligne = source.slice(0, m.index!).split("\n").length;
          fautifs.push(`${fichier}:${ligne}  useTranslations("${m[1]}")`);
        }
      }
      // Sans namespace, `useTranslations()` donne accès à TOUT le catalogue :
      // impossible de garantir ce que le provider racine porte.
      if (/useTranslations\(\s*\)/.test(source)) {
        fautifs.push(`${fichier}  useTranslations() sans namespace`);
      }
    }

    expect(
      fautifs,
      "namespace lu au-dessus du provider racine : l'ajouter à " +
        "ROOT_PROVIDER_NAMESPACES, ou déplacer le composant sous le provider " +
        "du groupe (protected)",
    ).toEqual([]);
  });

  it("le layout racine fournit bien ces namespaces", () => {
    // Garde-fou du garde-fou : si le provider disparaît du layout, le test
    // ci-dessus deviendrait une vérification à vide.
    const layout = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf-8");
    expect(layout).toContain("NextIntlClientProvider");
    expect(layout).toContain("ROOT_PROVIDER_NAMESPACES");
    expect(ROOT_PROVIDER_NAMESPACES.length).toBeGreaterThan(0);
  });
});
