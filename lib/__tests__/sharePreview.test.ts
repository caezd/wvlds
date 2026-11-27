import { describe, it, expect } from "vitest";
import { shareTargetFromNext, safeNextPath, parseSharePreview, worldCardContent } from "@/lib/sharePreview";

const W = "f1e4d2c9-e56f-454a-bde2-8f9eade06e65";
const C = "0df5be1c-e6e1-4806-b0fc-211a9d14ac24";

describe("safeNextPath : seul un chemin interne sert de retour après connexion", () => {
  it("garde un chemin de l'application, requête comprise", () => {
    expect(safeNextPath(`/w/${W}`)).toBe(`/w/${W}`);
    expect(safeNextPath(`/c/${C}?m=12`)).toBe(`/c/${C}?m=12`);
    expect(safeNextPath("/settings")).toBe("/settings");
  });

  it("refuse tout ce qui mènerait hors du site", () => {
    for (const v of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "w/abc", "", null, undefined]) {
      expect(safeNextPath(v as string | null | undefined)).toBeNull();
    }
  });

  it("ne renvoie jamais vers les pages de connexion elles-mêmes (boucle)", () => {
    expect(safeNextPath("/auth/login")).toBeNull();
    expect(safeNextPath("/auth/sign-up?next=/w/x")).toBeNull();
  });
});

describe("shareTargetFromNext : monde ou salon visé par le lien partagé", () => {
  it("reconnaît un monde et un salon", () => {
    expect(shareTargetFromNext(`/w/${W}`)).toEqual({ kind: "world", id: W });
    expect(shareTargetFromNext(`/w/${W}?view=wiki`)).toEqual({ kind: "world", id: W });
    expect(shareTargetFromNext(`/c/${C}`)).toEqual({ kind: "chatroom", id: C });
  });

  it("ignore le reste, et un id qui n'est pas un uuid (jamais envoyé à la base)", () => {
    expect(shareTargetFromNext("/settings")).toBeNull();
    expect(shareTargetFromNext("/w/pas-un-uuid")).toBeNull();
    expect(shareTargetFromNext(`https://evil.test/w/${W}`)).toBeNull();
    expect(shareTargetFromNext(null)).toBeNull();
  });
});

describe("parseSharePreview : la réponse de get_world_share_preview", () => {
  it("lit un monde public", () => {
    expect(
      parseSharePreview({
        id: W,
        name: "Hextech",
        description: "Un monde",
        icon_url: "https://x/icon.webp",
        banner_url: "https://x/banner.webp",
        color: "#112233",
        age_restricted: false,
        member_count: 7,
        chatroom_name: null,
      }),
    ).toEqual({
      id: W,
      name: "Hextech",
      description: "Un monde",
      iconUrl: "https://x/icon.webp",
      bannerUrl: "https://x/banner.webp",
      color: "#112233",
      ageRestricted: false,
      memberCount: 7,
      chatroomName: null,
      isPrivate: false,
    });
  });

  it("un monde privé : son nom seul, quoi que la réponse contienne d'autre", () => {
    expect(
      parseSharePreview({
        id: W,
        name: "FINAL COCKTASY",
        private: true,
        description: "fuite",
        icon_url: "https://x/icon.webp",
        banner_url: "https://x/banner.webp",
        member_count: 4,
        chatroom_name: "Taverne",
      }),
    ).toEqual({
      id: W,
      name: "FINAL COCKTASY",
      description: null,
      iconUrl: null,
      bannerUrl: null,
      color: null,
      ageRestricted: false,
      memberCount: 0,
      chatroomName: null,
      isPrivate: true,
    });
  });

  it("rien pour un monde absent ou non public, ou une réponse malformée", () => {
    expect(parseSharePreview(null)).toBeNull();
    expect(parseSharePreview({})).toBeNull();
    expect(parseSharePreview({ id: W, name: "" })).toBeNull();
  });

  it("n'accepte d'images que servies en https", () => {
    const p = parseSharePreview({ id: W, name: "M", banner_url: "javascript:x", icon_url: "http://x/i.png", member_count: 1 });
    expect(p?.bannerUrl).toBeNull();
    expect(p?.iconUrl).toBeNull();
  });
});

describe("worldCardContent : la carte d'un monde dans l'image d'aperçu", () => {
  const base = parseSharePreview({ id: W, name: "Hextech", description: "Un monde", icon_url: "https://x/i.webp", member_count: 7 })!;
  const labels = { privateWorld: "Monde privé · sur invitation", members: (n: number) => `${n} membres` };

  it("un monde public : son nom et ses membres, son icône", () => {
    expect(worldCardContent(base, labels)).toEqual({ name: "Hextech", meta: "7 membres", locked: false });
  });

  it("un monde 18+ : comme un monde public, son icône et ses membres, sans mention 18+", () => {
    const adulte = { ...base, ageRestricted: true, description: null };
    expect(worldCardContent(adulte, labels)).toEqual({ name: "Hextech", meta: "7 membres", locked: false });
  });

  it("un monde privé : un cadenas, son nom, « sur invitation »", () => {
    const prive = parseSharePreview({ id: W, name: "FINAL COCKTASY", private: true })!;
    expect(worldCardContent(prive, labels)).toEqual({
      name: "FINAL COCKTASY",
      meta: "Monde privé · sur invitation",
      locked: true,
    });
  });

  it("un salon : la carte de son monde", () => {
    expect(worldCardContent({ ...base, chatroomName: "La taverne" }, labels)).toEqual(worldCardContent(base, labels));
  });
});
