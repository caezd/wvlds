import { describe, it, expect } from "vitest";
import { ogImage, ogLocaleTag, siteMetadata } from "@/lib/siteMetadata";

describe("ogImage : image d'aperçu avec son texte de remplacement", () => {
  it("dimensions de la carte et texte alternatif", () => {
    expect(ogImage("/api/og?lang=fr", "WVLDS")).toEqual({ url: "/api/og?lang=fr", width: 1200, height: 630, alt: "WVLDS" });
  });
});

describe("ogLocaleTag : langue au format OpenGraph", () => {
  it("fr, en, es ; toute autre langue en français", () => {
    expect(ogLocaleTag("fr")).toBe("fr_FR");
    expect(ogLocaleTag("en")).toBe("en_US");
    expect(ogLocaleTag("es")).toBe("es_ES");
    expect(ogLocaleTag("de")).toBe("fr_FR");
  });
});

describe("siteMetadata : aperçu générique de l'application", () => {
  const meta = siteMetadata("Créez des mondes.", "en");

  it("adresse canonique : l'accueil, pour que toutes les variantes comptent pour une page", () => {
    expect(meta.openGraph).toMatchObject({ url: "/" });
  });

  it("image traduite, décrite pour les lecteurs d'écran, reprise par X", () => {
    const image = { url: "/api/og?lang=en", width: 1200, height: 630, alt: "WVLDS · Créez des mondes." };
    expect(meta.openGraph).toMatchObject({ siteName: "WVLDS", locale: "en_US", images: [image] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [image] });
  });
});
