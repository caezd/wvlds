import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";

import { loadOgImage, ogImageSource } from "@/lib/ogImages";

const SUPABASE = "https://projet.supabase.co";
const BANNIERE = `${SUPABASE}/storage/v1/object/public/worlds/user-1/world-2/banner-3.webp`;

const webp = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#f94b5f" } }).webp().toBuffer();

const reponse = (body: Uint8Array | string, init: ResponseInit = {}) =>
  new Response(body as BodyInit, { status: 200, ...init });

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ogImageSource : seules les images publiques du stockage de l'application", () => {
  it("accepte une image publique du stockage Supabase", () => {
    expect(ogImageSource(BANNIERE)).toBe(BANNIERE);
  });

  it("refuse tout autre hôte, et le stockage privé", () => {
    expect(ogImageSource("https://ailleurs.test/storage/v1/object/public/worlds/a.webp")).toBeNull();
    expect(ogImageSource(`${SUPABASE}/storage/v1/object/sign/worlds/a.webp`)).toBeNull();
    expect(ogImageSource(`${SUPABASE}.ailleurs.test/storage/v1/object/public/a.webp`)).toBeNull();
    expect(ogImageSource(null)).toBeNull();
  });
});

describe("loadOgImage : image WebP convertie pour le moteur de next/og", () => {
  it("rend la bannière en JPEG aux dimensions demandées", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse(await webp(300, 100)));
    vi.stubGlobal("fetch", fetchMock);

    const url = await loadOgImage(BANNIERE, { width: 120, height: 63, format: "jpeg" });

    expect(fetchMock).toHaveBeenCalledWith(BANNIERE, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    const meta = await sharp(Buffer.from(url!.split(",")[1], "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 120, 63]);
  });

  it("rend l'icône en PNG carré", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(await webp(50, 80))));
    const url = await loadOgImage(BANNIERE, { width: 32, height: 32, format: "png" });
    const meta = await sharp(Buffer.from(url!.split(",")[1], "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 32, 32]);
  });

  it("n'interroge pas une adresse hors du stockage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadOgImage("https://ailleurs.test/a.webp", { width: 10, height: 10, format: "png" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toute défaillance donne null : réseau, statut, fichier trop lourd, contenu illisible", async () => {
    const opts = { width: 10, height: 10, format: "png" } as const;
    const cas: Array<() => Promise<Response>> = [
      () => Promise.reject(new Error("réseau")),
      () => Promise.resolve(reponse("", { status: 404 })),
      () => Promise.resolve(reponse("x", { headers: { "content-length": String(20 * 1024 * 1024) } })),
      () => Promise.resolve(reponse("pas une image")),
    ];
    for (const repondre of cas) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(repondre));
      expect(await loadOgImage(BANNIERE, opts)).toBeNull();
    }
  });
});
