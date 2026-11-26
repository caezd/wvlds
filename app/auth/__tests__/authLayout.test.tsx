import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let search = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-wvlds-search": search }),
}));
vi.mock("next-intl/server", async () => {
  const { useTranslations: translator } = await import("next-intl");
  return {
    getTranslations: async (ns: string) => translator(ns),
    getLocale: async () => "fr",
    getMessages: async () => ({ auth: {} }),
  };
});
const getSharePreview = vi.fn();
vi.mock("@/lib/sharePreviewServer", () => ({ getSharePreview: (...a: unknown[]) => getSharePreview(...a) }));

import AuthLayout from "@/app/auth/layout";

const W = "f1e4d2c9-e56f-454a-bde2-8f9eade06e65";

beforeEach(() => {
  search = "";
  getSharePreview.mockReset();
});

describe("layout des écrans de connexion : colonne droite", () => {
  it("par défaut : le logo et la mention « en bêta »", async () => {
    render(await AuthLayout({ children: <p>formulaire</p> }));
    expect(screen.getByText("Wvlds est en bêta.")).toBeInTheDocument();
    expect(getSharePreview).not.toHaveBeenCalled();
  });

  it("depuis un lien de monde public : le monde, sans la mention « en bêta »", async () => {
    search = `?next=${encodeURIComponent(`/w/${W}`)}`;
    getSharePreview.mockResolvedValue({
      id: W,
      name: "Hextech",
      description: null,
      iconUrl: null,
      bannerUrl: null,
      color: null,
      ageRestricted: false,
      memberCount: 3,
      chatroomName: null,
      isPrivate: false,
    });
    render(await AuthLayout({ children: <p>formulaire</p> }));
    expect(getSharePreview).toHaveBeenCalledWith({ kind: "world", id: W });
    expect(screen.getByRole("heading", { name: "Hextech" })).toBeInTheDocument();
    expect(screen.queryByText("Wvlds est en bêta.")).toBeNull();
  });

  it("monde non public : la colonne par défaut", async () => {
    search = `?next=${encodeURIComponent(`/w/${W}`)}`;
    getSharePreview.mockResolvedValue(null);
    render(await AuthLayout({ children: <p>formulaire</p> }));
    expect(screen.getByText("Wvlds est en bêta.")).toBeInTheDocument();
  });
});
