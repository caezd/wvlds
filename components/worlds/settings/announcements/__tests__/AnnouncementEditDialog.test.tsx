import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k, useLocale: () => "fr" }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));
vi.mock("@/components/ui/image-crop-picker", () => ({ ImagePickerCropField: () => null }));
const update = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/worldAnnouncements", async (orig) => ({
  ...(await orig<typeof import("@/lib/worldAnnouncements")>()),
  updateWorldAnnouncement: update,
}));

import { AnnouncementEditDialog } from "@/components/worlds/settings/announcements/AnnouncementEditDialog";
import type { WorldAnnouncement } from "@/lib/worldAnnouncements";

const A: WorldAnnouncement = {
  id: "a1", kind: "notification", title: "Rentrée", body: "La saison reprend.", role_ids: [], filters: {},
  recipient_count: 4, created_at: "2026-11-20T10:00:00Z", retracted_at: null, signed_as_world: false,
  banner_until: null, show_on_home: false, pinned_at: null, label: null, image_url: null, edited_at: null,
  author: { username: "moi" },
};

beforeEach(() => vi.clearAllMocks());

describe("AnnouncementEditDialog", () => {
  it("n'envoie que l'option changée, sans toucher au contenu", async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<AnnouncementEditDialog announcement={A} open onOpenChange={() => {}} onSaved={onSaved} />);
    expect(screen.getByTestId("announcement-edit-save")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "important" }));
    await user.click(screen.getByTestId("announcement-edit-save"));

    await waitFor(() => expect(update).toHaveBeenCalledWith({}, "a1", { extras: { label: "important" } }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("envoie le titre modifié", async () => {
    const user = userEvent.setup();
    render(<AnnouncementEditDialog announcement={A} open onOpenChange={() => {}} onSaved={() => {}} />);
    const titre = screen.getByTestId("announcement-edit-title");
    await user.clear(titre);
    await user.type(titre, "Rentrée 2027");
    await user.click(screen.getByTestId("announcement-edit-save"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({}, "a1", { title: "Rentrée 2027", extras: {} }));
  });

  it("une annonce retirée ne se modifie plus dans son contenu", () => {
    render(<AnnouncementEditDialog announcement={{ ...A, retracted_at: "2026-11-21T10:00:00Z" }} open onOpenChange={() => {}} onSaved={() => {}} />);
    expect(screen.getByTestId("announcement-edit-title")).toBeDisabled();
    expect(screen.getByTestId("announcement-edit-body")).toBeDisabled();
  });

  it("épingler n'est possible qu'une fois l'annonce sur l'accueil", async () => {
    const user = userEvent.setup();
    render(<AnnouncementEditDialog announcement={A} open onOpenChange={() => {}} onSaved={() => {}} />);
    const epingle = screen.getByRole("switch", { name: "pinned" });
    expect(epingle).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "showOnHome" }));
    expect(epingle).toBeEnabled();
  });
});
