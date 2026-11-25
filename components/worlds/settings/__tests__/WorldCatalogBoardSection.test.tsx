import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const can = vi.fn();
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({ can: (p: string) => can(p) }),
}));
const flags = { world_economy: true };
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => flags,
}));
vi.mock("@/components/worlds/wiki/WikiLinkContext", () => ({
  WikiLinkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const getWorldCatalogUsage = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  getWorldCatalogUsage: (...args: unknown[]) => getWorldCatalogUsage(...args),
}));
// Le tableau du catalogue a ses propres tests : on ne vérifie ici que ce qu'il reçoit.
const catalogueList = vi.fn();
vi.mock("@/components/worlds/catalogue/CatalogueList", () => ({
  CatalogueList: (props: Record<string, unknown>) => {
    catalogueList(props);
    return <div data-testid="catalogue-list" />;
  },
}));

import { WorldCatalogBoardSection } from "@/components/worlds/settings/WorldCatalogBoardSection";

beforeEach(() => {
  vi.clearAllMocks();
  flags.world_economy = true;
  can.mockReturnValue(true);
  getWorldCatalogUsage.mockResolvedValue({ ok: true, usage: { i1: 2 } });
});

describe("WorldCatalogBoardSection", () => {
  it("une section Objets : le catalogue des objets, en édition, avec le décompte d'usage", async () => {
    render(<WorldCatalogBoardSection worldId="w1" type="inventory" />);
    const section = screen.getByRole("region", { name: "Objets" });
    expect(within(section).getByTestId("catalogue-list")).toBeInTheDocument();
    expect(catalogueList).toHaveBeenLastCalledWith(expect.objectContaining({ type: "inventory", worldId: "w1", canEdit: true }));
    await waitFor(() => expect(catalogueList).toHaveBeenLastCalledWith(expect.objectContaining({ usage: { i1: 2 } })));
    expect(getWorldCatalogUsage).toHaveBeenCalledWith("w1");
  });

  it("le tableau s'étire sur la hauteur disponible (mise en page flex, aucune hauteur calculée)", () => {
    render(<WorldCatalogBoardSection worldId="w1" type="inventory" />);
    expect(catalogueList).toHaveBeenLastCalledWith(expect.objectContaining({ fill: true }));
    expect(screen.getByTestId("catalog-board").style.height).toBe("");
    expect(screen.getByTestId("catalog-board").style.minHeight).toBe("");
  });

  it("sans la permission catalog.edit, le catalogue se lit sans s'éditer", () => {
    can.mockImplementation((p: string) => p !== "catalog.edit");
    render(<WorldCatalogBoardSection worldId="w1" type="inventory" />);
    expect(catalogueList).toHaveBeenLastCalledWith(expect.objectContaining({ canEdit: false }));
  });

  it("un lien vers la page Boutiques, pour mettre les objets en vente", () => {
    render(<WorldCatalogBoardSection worldId="w1" type="inventory" />);
    expect(screen.getByRole("link", { name: "Mettre en vente dans une boutique" })).toHaveAttribute(
      "href",
      "/w/w1?view=settings&section=shops",
    );
  });

  it("sans l'économie (drapeau), pas de lien vers les boutiques", () => {
    flags.world_economy = false;
    render(<WorldCatalogBoardSection worldId="w1" type="inventory" />);
    expect(screen.queryByRole("link", { name: "Mettre en vente dans une boutique" })).toBeNull();
  });

  it("compétences : le tableau des compétences, sans lien vers les boutiques", () => {
    render(<WorldCatalogBoardSection worldId="w1" type="skills" />);
    expect(screen.getByRole("region", { name: "Compétences" })).toBeInTheDocument();
    expect(catalogueList).toHaveBeenLastCalledWith(expect.objectContaining({ type: "skills", canEdit: true, fill: true }));
    expect(screen.queryByRole("link", { name: "Mettre en vente dans une boutique" })).toBeNull();
  });
});
