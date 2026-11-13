import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Le bloc s'abonne aux changements de catégories ; ici, un canal qui ne dit rien.
vi.mock("@/lib/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "is", "in"]) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { createClient: vi.fn(() => ({ channel: () => channel, removeChannel: vi.fn(), from: () => builder })) };
});
vi.mock("@/hooks/useReconnectEpoch", () => ({ useReconnectEpoch: () => 0 }));

import { WorldCategoryFolders } from "@/components/worlds/chatrooms/WorldCategoryFolders";

const CATEGORIES = [
  { id: "c1", title: "Taverne", description: null, banner_url: null, icon_url: null, position: 0 },
  { id: "c2", title: "Forêt", description: "Les bois", banner_url: null, icon_url: null, position: 1 },
];

describe("WorldCategoryFolders", () => {
  it("chaque catégorie est une carte à bascule (InteractiveCard) : un clic filtre, un second retire le filtre", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <WorldCategoryFolders worldId="w1" selectedCategoryId={null} onSelectCategory={onSelect} initialCategories={CATEGORIES} />,
    );
    const taverne = screen.getByRole("button", { name: /Taverne/ });
    expect(taverne).toHaveAttribute("data-slot", "interactive-card");
    expect(taverne).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(taverne);
    expect(onSelect).toHaveBeenCalledWith("c1");

    rerender(<WorldCategoryFolders worldId="w1" selectedCategoryId="c1" onSelectCategory={onSelect} initialCategories={CATEGORIES} />);
    const active = screen.getByRole("button", { name: /Taverne/ });
    expect(active).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(active);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
