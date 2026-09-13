import { describe, it, expect } from "vitest";

import { MAP_WIDTH_FIRST_TIER, MAP_WIDTH_TIERS, mapImageSrc } from "@/components/worlds/map/mapImage";

// Le serveur précharge l'image de la carte pendant que le navigateur lit le
// HTML ; le client la demande ensuite. Les deux passent par ici — un
// caractère d'écart, et l'image serait téléchargée deux fois.

const PUBLIQUE = "https://x.supabase.co/storage/v1/object/public/worlds/w1/map.webp";

describe("mapImageSrc", () => {
  it("sert le palier demandé", () => {
    expect(mapImageSrc(PUBLIQUE, 1600)).toContain("width=1600");
    expect(mapImageSrc(PUBLIQUE, 1600)).toContain("/render/image/public/");
  });

  it("rend deux fois la même adresse pour le même palier", () => {
    expect(mapImageSrc(PUBLIQUE, MAP_WIDTH_FIRST_TIER)).toBe(mapImageSrc(PUBLIQUE, MAP_WIDTH_TIERS[0]));
  });

  it("rend l'image entière au-delà du dernier palier", () => {
    expect(mapImageSrc(PUBLIQUE, null)).toBe(PUBLIQUE);
  });

  it("ne transforme pas ce qu'imgproxy ne sait pas traiter", () => {
    // `supabaseThumb` rend un PNG inchangé : le `??` doit rendre l'URL, et
    // non `undefined`, sans quoi la carte ne s'afficherait pas du tout.
    const png = "https://x.supabase.co/storage/v1/object/public/worlds/w1/map.png";
    expect(mapImageSrc(png, 1600)).toBe(png);
  });

  it("ne rend rien sans image", () => {
    expect(mapImageSrc(null, 1600)).toBeNull();
    expect(mapImageSrc(undefined, 1600)).toBeNull();
  });
});
