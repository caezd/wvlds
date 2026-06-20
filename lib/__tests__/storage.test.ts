import { describe, it, expect } from "vitest";
import { supabaseThumb, cleanStorageUrl } from "@/lib/storage";

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
