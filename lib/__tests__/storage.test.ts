import { describe, it, expect } from "vitest";
import { supabaseThumb, cleanStorageUrl, avatarThumbWidth, AVATAR_THUMB_SMALL, AVATAR_THUMB_LARGE } from "@/lib/storage";

const PUBLIC = "https://x.supabase.co/storage/v1/object/public/bucket/img.jpg";
const RENDER = "https://x.supabase.co/storage/v1/render/image/public/bucket/img.jpg";

describe("supabaseThumb", () => {
  it("retourne undefined pour une URL absente", () => {
    expect(supabaseThumb(null, 100)).toBeUndefined();
    expect(supabaseThumb(undefined, 100)).toBeUndefined();
  });

  it("transforme une URL publique Supabase en URL de rendu avec width/quality", () => {
    const out = supabaseThumb(PUBLIC, 200, 70);
    expect(out).toBe(`${RENDER}?width=200&quality=70&resize=contain`);
  });

  it("inclut height et resize quand fournis", () => {
    const out = supabaseThumb(PUBLIC, 200, 80, 150, "cover");
    expect(out).toBe(`${RENDER}?width=200&height=150&quality=80&resize=cover`);
  });

  it("préserve le cache-buster ?t= s'il est présent", () => {
    const out = supabaseThumb(`${PUBLIC}?t=123`, 200);
    expect(out).toContain("&t=123");
  });

  it("retourne l'URL inchangée si ce n'est pas une URL Storage publique", () => {
    expect(supabaseThumb("https://autre.com/x.jpg", 200)).toBe("https://autre.com/x.jpg");
  });

  it("ne transforme pas les PNG (imgproxy échoue sur certains variants)", () => {
    const png = "https://x.supabase.co/storage/v1/object/public/bucket/img.png";
    expect(supabaseThumb(png, 200)).toBe(png);
  });
});

describe("cleanStorageUrl", () => {
  it("retire la query string", () => {
    expect(cleanStorageUrl(`${PUBLIC}?t=999`)).toBe(PUBLIC);
  });

  it("laisse une URL sans query inchangée", () => {
    expect(cleanStorageUrl(PUBLIC)).toBe(PUBLIC);
  });
});

describe("avatarThumbWidth", () => {
  // Le vrai sujet n'est pas la netteté mais le PARTAGE : calculer « taille × 3 »
  // par surface donnait une URL différente par vue (384 pour une fiche, 480
  // pour une grille, 600 pour une carte), donc un téléchargement par vue du
  // même avatar. Le cache du navigateur n'y peut rien : on ne lui redemande
  // jamais la même URL.
  it("donne la même largeur à toutes les tailles d'avatar d'une même famille", () => {
    // Fiche (128), grille d'un monde (160), carte (200) : une seule image.
    expect(avatarThumbWidth(128)).toBe(avatarThumbWidth(160));
    expect(avatarThumbWidth(160)).toBe(avatarThumbWidth(200));
    // Message (32), liste (24), icône de monde (40) : une seule image aussi.
    expect(avatarThumbWidth(24)).toBe(avatarThumbWidth(32));
    expect(avatarThumbWidth(32)).toBe(avatarThumbWidth(40));
  });

  // Deux paliers et pas un seul : servir le grand palier à l'avatar de 32 px
  // d'un message alourdirait un fil de discussion pour rien.
  it("garde un petit palier distinct pour les avatars des listes et des messages", () => {
    expect(avatarThumbWidth(32)).toBe(AVATAR_THUMB_SMALL);
    expect(avatarThumbWidth(128)).toBe(AVATAR_THUMB_LARGE);
    expect(AVATAR_THUMB_SMALL).toBeLessThan(AVATAR_THUMB_LARGE);
  });

  it("couvre les écrans à forte densité de chaque palier", () => {
    // Le seuil est à 44 px CSS, soit 132 px physiques sur un écran 3x.
    expect(avatarThumbWidth(44)).toBeGreaterThanOrEqual(44 * 2.9);
    expect(avatarThumbWidth(160)).toBeGreaterThanOrEqual(160 * 3);
  });
});
