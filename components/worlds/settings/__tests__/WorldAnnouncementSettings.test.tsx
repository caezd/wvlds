import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MAX_ANNOUNCEMENT_HTML_LENGTH } from "@/components/worlds/home/worldHomeWidgets";
import type { World } from "@/types/worlds";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const setWorldAnnouncementMock = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldAnnouncement: (...args: unknown[]) => setWorldAnnouncementMock(...args),
}));

import { WorldAnnouncementSettings } from "@/components/worlds/settings/WorldAnnouncementSettings";
import { toast } from "sonner";

const BASE_WORLD: World = {
  id: "w1",
  name: "Veldis",
  announcement_html: null,
  announcement_size: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  setWorldAnnouncementMock.mockResolvedValue({ ok: true });
});

describe("WorldAnnouncementSettings", () => {
  it("préremplit le champ avec l'annonce déjà enregistrée", () => {
    render(<WorldAnnouncementSettings world={{ ...BASE_WORLD, announcement_html: "<p>Salut</p>", announcement_size: "lg" }} />);
    expect(screen.getByLabelText("HTML / CSS")).toHaveValue("<p>Salut</p>");
    expect(screen.getByText("Grande").className).toContain("border-primary");
  });

  it("enregistre le HTML saisi et la taille choisie, puis rafraîchit", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementSettings world={BASE_WORLD} />);

    await user.type(screen.getByLabelText("HTML / CSS"), "<p>Salut</p>");
    await user.click(screen.getByText("Petite"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(setWorldAnnouncementMock).toHaveBeenCalledWith("w1", "<p>Salut</p>", "sm");
    expect(refreshMock).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("n'enregistre pas au-delà de la limite de caractères", async () => {
    const tooLong = "a".repeat(MAX_ANNOUNCEMENT_HTML_LENGTH + 1);
    render(<WorldAnnouncementSettings world={{ ...BASE_WORLD, announcement_html: tooLong }} />);

    const saveButton = screen.getByRole("button", { name: "Enregistrer" });
    expect(saveButton).toBeDisabled();
    expect(setWorldAnnouncementMock).not.toHaveBeenCalled();
  });

  it("affiche un toast d'erreur et ne rafraîchit pas si l'action échoue", async () => {
    setWorldAnnouncementMock.mockResolvedValue({ ok: false, error: "boom" });
    const user = userEvent.setup();
    render(<WorldAnnouncementSettings world={{ ...BASE_WORLD, announcement_html: "<p>x</p>" }} />);

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(toast.error).toHaveBeenCalledWith("boom");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("le sandbox de l'aperçu n'accorde jamais allow-scripts", () => {
    render(<WorldAnnouncementSettings world={{ ...BASE_WORLD, announcement_html: "<p>x</p>" }} />);
    const iframe = document.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("");
  });
});
