import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { WikiPageMapLink } from "@/components/worlds/wiki/WikiPageMapLink";

// ──────────────────────────────────────────────────────────────────────────
// Une épingle peut désigner la page qu'elle raconte depuis la migration 150, et
// l'index posé ce jour-là servait à lire ce lien À L'ENVERS — sans que rien ne
// l'ait jamais fait. La page d'un lieu mène maintenant à sa position.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const flags = vi.hoisted(() => ({ world_map: true }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => flags,
}));

function monter(epingles: unknown, worldId = "w1") {
  const mock = createSupabaseMock({ results: [{ data: epingles }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WikiPageMapLink worldId={worldId} pageId="page1" />);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.world_map = true;
});

describe("WikiPageMapLink", () => {
  it("mène à l'épingle qui raconte cette page", async () => {
    monter([{ id: "pin1", map_id: "map2", title: "Le port" }]);

    const lien = await screen.findByRole("button", { name: /Voir sur la carte : Le port/ });
    await userEvent.click(lien);

    // La carte ET l'épingle : l'adresse sait désigner un lieu précis depuis que
    // la vue s'y écrit.
    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=map&map=map2&pin=pin1");
  });

  it("montre chaque épingle quand plusieurs pointent la page", async () => {
    monter([
      { id: "pin1", map_id: "map1", title: "Le port" },
      { id: "pin2", map_id: "map2", title: "Le port souterrain" },
    ]);

    expect(await screen.findByRole("button", { name: /Le port souterrain/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("ne montre rien quand aucune épingle ne désigne la page", async () => {
    // Le cas courant : une page de wiki n'est pas forcément un lieu.
    const mock = monter([]);
    await vi.waitFor(() => expect(mock.from).toHaveBeenCalled());

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ne demande rien quand la carte est désactivée", () => {
    flags.world_map = false;
    const mock = monter([{ id: "pin1", map_id: "map1", title: "Le port" }]);

    expect(mock.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
