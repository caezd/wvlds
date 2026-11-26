import { describe, it, expect } from "vitest";
import { shareTargetFromNext, safeNextPath, parseSharePreview, shareCardContent } from "@/lib/sharePreview";

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

describe("shareCardContent : textes de l'image d'aperçu", () => {
  const base = parseSharePreview({ id: W, name: "Hextech", description: "Un monde", member_count: 7 })!;
  const labels = { publicWorld: "Monde public", ageRestricted: "18+" };

  it("un monde : son nom en titre, sa description dessous", () => {
    expect(shareCardContent(base, labels)).toEqual({ surtitle: "Monde public", title: "Hextech", subtitle: "Un monde" });
  });

  it("un salon : le salon en titre, le monde au-dessus", () => {
    expect(shareCardContent({ ...base, chatroomName: "La taverne" }, labels)).toEqual({
      surtitle: "Hextech",
      title: "# La taverne",
      subtitle: "Un monde",
    });
  });

  it("un monde 18+ : la mention, sans description", () => {
    expect(shareCardContent({ ...base, ageRestricted: true, description: null }, labels)).toEqual({
      surtitle: "Monde public · 18+",
      title: "Hextech",
      subtitle: null,
    });
  });
});
