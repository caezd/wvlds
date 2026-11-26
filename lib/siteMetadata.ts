import type { Metadata } from "next";

/**
 * Aperçu des liens (OpenGraph, X) : celui de l'application, posé par
 * app/layout.tsx, et ses briques, reprises par la page de connexion pour le
 * lien d'un monde. Next remplace l'objet `openGraph` du parent sans le
 * fusionner : une page qui pose le sien doit tout reposer.
 */

/** Langue d'un aperçu de lien, au format OpenGraph. */
const OG_LOCALES: Record<string, string> = { fr: "fr_FR", en: "en_US", es: "es_ES" };

export function ogLocaleTag(locale: string): string {
  return OG_LOCALES[locale] ?? OG_LOCALES.fr;
}

/** L'image d'aperçu (app/api/og, 1200×630), décrite pour les lecteurs d'écran. */
export function ogImage(url: string, alt: string) {
  return { url, width: 1200, height: 630, alt };
}

/**
 * Aperçu générique. L'adresse canonique est l'accueil : sans session, tout
 * lien mène à la connexion, et ses variantes comptent pour une seule page.
 * L'image reçoit la langue dans son adresse : les robots qui la demandent
 * n'envoient pas le cookie de langue.
 */
export function siteMetadata(description: string, locale: string): Pick<Metadata, "openGraph" | "twitter"> {
  const image = ogImage(`/api/og?lang=${locale}`, `WVLDS · ${description}`);
  return {
    openGraph: {
      type: "website",
      siteName: "WVLDS",
      url: "/",
      title: "WVLDS",
      description,
      locale: ogLocaleTag(locale),
      images: [image],
    },
    twitter: { card: "summary_large_image", title: "WVLDS", description, images: [image] },
  };
}
