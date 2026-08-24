import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const updateChatroomCategoryMock = vi.fn();
vi.mock("@/app/actions/chatroomCategories", () => ({
  addChatroomCategory: vi.fn(),
  updateChatroomCategory: (...args: unknown[]) => updateChatroomCategoryMock(...args),
  deleteChatroomCategory: vi.fn(),
  reorderChatroomCategories: vi.fn(),
}));

import { WorldCategoryManager } from "@/components/worlds/settings/WorldCategoryManager";

const category = {
  id: "cat-1",
  world_id: "world-1",
  title: "Annonces",
  description: "Les news du monde",
  banner_url: "https://x/image.png" as string | null,
  icon_url: "https://x/image.png" as string | null,
  position: 0,
};

function setup(overrides: Partial<typeof category> = {}) {
  const mock = createSupabaseMock({ results: [{ data: [{ ...category, ...overrides }] }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

async function openEditForm(user: ReturnType<typeof userEvent.setup>) {
  const row = (await screen.findByText("Annonces")).closest(".group")!;
  await user.click(row.querySelectorAll("button")[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  updateChatroomCategoryMock.mockResolvedValue({ ok: true });
});

describe("WorldCategoryManager — image unique de catégorie", () => {
  it("propose un bouton « Retirer l'image » quand une image est déjà définie", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldCategoryManager worldId="world-1" canEdit />);

    await openEditForm(user);

    expect(screen.getByText("Retirer l'image")).toBeInTheDocument();
  });

  it("n'affiche pas le bouton quand il n'y a pas d'image", async () => {
    setup({ banner_url: null, icon_url: null });
    const user = userEvent.setup();
    render(<WorldCategoryManager worldId="world-1" canEdit />);

    await openEditForm(user);

    expect(screen.queryByText("Retirer l'image")).not.toBeInTheDocument();
  });

  it("efface l'image et enregistre banner_url et icon_url à null", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldCategoryManager worldId="world-1" canEdit />);

    await openEditForm(user);
    await user.click(screen.getByText("Retirer l'image"));
    // Le bouton disparaît une fois l'image effacée localement.
    expect(screen.queryByText("Retirer l'image")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateChatroomCategoryMock).toHaveBeenCalledWith(
      "cat-1",
      expect.objectContaining({ banner_url: null, icon_url: null }),
    );
  });

  it("une catégorie créée avant l'unification (banner_url ≠ icon_url) affiche quand même l'image existante", async () => {
    setup({ banner_url: "https://x/old-banner.png", icon_url: "https://x/old-icon.png" });
    const user = userEvent.setup();
    render(<WorldCategoryManager worldId="world-1" canEdit />);

    await openEditForm(user);

    expect(screen.getByText("Retirer l'image")).toBeInTheDocument();
  });
});
