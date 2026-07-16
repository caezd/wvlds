import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "sidebar.subjects": `${opts?.count ?? 0} sujet(s)`,
    };
    return map[key] ?? key;
  },
}));

import { WorldCategoryFolders } from "@/components/worlds/chatrooms/WorldCategoryFolders";

const categories = [
  { id: "cat-1", title: "Annonces", banner_url: null, icon_url: null, position: 0 },
  { id: "cat-2", title: "Hors-sujet", banner_url: null, icon_url: null, position: 1 },
];

const chatroomsByCategory = [
  { category_id: "cat-1" },
  { category_id: "cat-1" },
  { category_id: "cat-2" },
  { category_id: null },
];

describe("WorldCategoryFolders", () => {
  let mock: ReturnType<typeof createSupabaseMock>;

  beforeEach(() => {
    mock = createSupabaseMock({
      results: [
        { data: categories },
        { data: chatroomsByCategory },
      ],
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(mock.client);
  });

  it("n'affiche rien tant qu'il n'y a pas de catégories", () => {
    const localMock = createSupabaseMock({ results: [{ data: [] }, { data: [] }] });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(localMock.client);
    const { container } = render(
      <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });

  it("affiche une carte par catégorie avec le nombre de chatrooms associées", async () => {
    await act(async () => {
      render(<WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />);
    });

    expect(screen.getByText("Annonces")).toBeInTheDocument();
    expect(screen.getByText("Hors-sujet")).toBeInTheDocument();
    expect(screen.getByText("2 sujet(s)")).toBeInTheDocument();
    expect(screen.getByText("1 sujet(s)")).toBeInTheDocument();
  });

  it("sélectionne une catégorie au clic", async () => {
    const onSelectCategory = vi.fn();
    await act(async () => {
      render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={onSelectCategory} />,
      );
    });

    screen.getByText("Annonces").closest("button")!.click();
    expect(onSelectCategory).toHaveBeenCalledWith("cat-1");
  });

  it("désélectionne la catégorie active au second clic", async () => {
    const onSelectCategory = vi.fn();
    await act(async () => {
      render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId="cat-1" onSelectCategory={onSelectCategory} />,
      );
    });

    screen.getByText("Annonces").closest("button")!.click();
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });
});
