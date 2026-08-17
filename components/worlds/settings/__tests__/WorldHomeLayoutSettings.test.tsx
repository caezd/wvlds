import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World } from "@/types/worlds";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { WorldHomeLayoutSettings } from "@/components/worlds/settings/WorldHomeLayoutSettings";

const BASE_WORLD: World = { id: "w1", name: "Veldis", home_layout: ["chatrooms"] };

function setup(results: Array<{ data?: unknown; error?: unknown }> = [{ error: null }]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldHomeLayoutSettings", () => {
  it("initialise l'éditeur avec l'ordre déjà enregistré du monde", () => {
    setup();
    render(<WorldHomeLayoutSettings world={BASE_WORLD} />);
    expect(screen.getByText("Salons")).toBeInTheDocument();
  });

  it("retombe sur l'ordre par défaut quand le monde n'a jamais été personnalisé", () => {
    setup();
    render(<WorldHomeLayoutSettings world={{ ...BASE_WORLD, home_layout: null }} />);
    expect(screen.getByText("Catégories")).toBeInTheDocument();
    expect(screen.getByText("Salons")).toBeInTheDocument();
  });

  it("rafraîchit la page (router.refresh) une fois un changement confirmé en base", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldHomeLayoutSettings world={BASE_WORLD} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Statistiques" }));

    expect(refreshMock).toHaveBeenCalled();
  });
});
