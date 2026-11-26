import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SharePreview } from "@/lib/sharePreview";

vi.mock("next-intl/server", async () => {
  const { useTranslations: translator } = await import("next-intl");
  return { getTranslations: async (ns: string) => translator(ns), getLocale: async () => "fr" };
});
const getSharePreview = vi.fn();
vi.mock("@/lib/sharePreviewServer", () => ({ getSharePreview: (...a: unknown[]) => getSharePreview(...a) }));
vi.mock("@/components/login-form", () => ({
  LoginForm: (p: { next?: string | null; worldName?: string | null }) => (
    <div data-testid="login-form" data-next={p.next ?? ""} data-world={p.worldName ?? ""} />
  ),
}));

import Page, { generateMetadata } from "@/app/auth/login/page";

const W = "f1e4d2c9-e56f-454a-bde2-8f9eade06e65";
const C = "0df5be1c-e6e1-4806-b0fc-211a9d14ac24";
const MONDE: SharePreview = {
  id: W,
  name: "Hextech",
  description: "Un monde",
  iconUrl: null,
  bannerUrl: null,
  color: null,
  ageRestricted: false,
  memberCount: 7,
  chatroomName: null,
};
const sp = (v: Record<string, string>) => ({ searchParams: Promise.resolve(v) });

beforeEach(() => getSharePreview.mockReset());

describe("page de connexion arrivée depuis un lien partagé", () => {
  it("sans lien : titre « Connexion », aperçu générique hérité", async () => {
    const meta = await generateMetadata(sp({}));
    expect(meta.title).toBe("Connexion");
    expect(meta.openGraph).toBeUndefined();
    expect(getSharePreview).not.toHaveBeenCalled();
  });

  it("lien de monde public : titre et aperçu du monde", async () => {
    getSharePreview.mockResolvedValue(MONDE);
    const meta = await generateMetadata(sp({ next: `/w/${W}` }));
    expect(getSharePreview).toHaveBeenCalledWith({ kind: "world", id: W });
    expect(meta.title).toBe("Hextech");
    expect(meta.description).toBe("Un monde");
    expect(meta.openGraph).toMatchObject({ title: "Hextech", description: "Un monde" });
    expect(JSON.stringify(meta.openGraph)).toContain(`/api/og?w=${W}&lang=fr`);
  });

  it("lien de salon : l'image d'aperçu est celle du salon", async () => {
    getSharePreview.mockResolvedValue({ ...MONDE, chatroomName: "La taverne" });
    const meta = await generateMetadata(sp({ next: `/c/${C}` }));
    expect(meta.title).toBe("La taverne · Hextech");
    expect(JSON.stringify(meta.openGraph)).toContain(`/api/og?c=${C}`);
  });

  it("monde non public : rien ne sort, la page reste « Connexion »", async () => {
    getSharePreview.mockResolvedValue(null);
    const meta = await generateMetadata(sp({ next: `/w/${W}` }));
    expect(meta.title).toBe("Connexion");
    expect(meta.openGraph).toBeUndefined();
  });

  it("transmet au formulaire le retour après connexion et le nom du monde", async () => {
    getSharePreview.mockResolvedValue(MONDE);
    render(await Page(sp({ next: `/w/${W}` })));
    const form = screen.getByTestId("login-form");
    expect(form).toHaveAttribute("data-next", `/w/${W}`);
    expect(form).toHaveAttribute("data-world", "Hextech");
  });

  it("un retour hors du site n'est pas transmis", async () => {
    render(await Page(sp({ next: "https://evil.test" })));
    expect(screen.getByTestId("login-form")).toHaveAttribute("data-next", "");
  });
});
