import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { indexCatalog } from "@/lib/worldCatalog";
import type { WorldCatalogItem } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// Sans fournisseur : `useWikiLinks` rend null, la fiche navigue elle-même.
const wikiLinks = vi.hoisted(() => ({ value: null as null | { resolve: (m: string) => string; onWikiLink: (s: string) => void; onMapLink: () => void } }));
vi.mock("@/components/worlds/wiki/WikiLinkContext", () => ({ useWikiLinks: () => wikiLinks.value }));

import { CatalogItemDetail } from "@/components/worlds/catalogue/CatalogItemDetail";
import { InventoryFieldView } from "@/components/personas/fields/CatalogFieldViews";

const EPEE: WorldCatalogItem = {
  id: "c-epee", world_id: "w1", type: "inventory", name: "Épée longue", rarity: "rare", stackable: false,
  description: "Forgée à **Karsk**, voir [[La Forge]].", properties: [{ label: "Poids", value: "1,5 kg" }], sort_index: 0,
};
const PAGES = [{ sort_index: 0, page: { id: "pg1", title: "La Forge", slug: "la-forge", icon: null, deleted_at: null } }];

function setup(pages: unknown[] = PAGES) {
  const mock = createSupabaseMock({ results: [{ data: pages }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); wikiLinks.value = null; });

describe("CatalogItemDetail", () => {
  it("rend la description en Markdown, les propriétés, la rareté et les pages liées", async () => {
    setup();
    render(<CatalogItemDetail item={EPEE} usageCount={3} open onOpenChange={() => {}} />);
    expect(await screen.findByText("Karsk")).toBeInTheDocument();
    expect(screen.getByText("Karsk").tagName).toBe("STRONG");
    expect(screen.getByText("Poids")).toBeInTheDocument();
    expect(screen.getByText("Objet unique")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "La Forge" })).toBeInTheDocument();
  });

  it("une page liée ouvre le wiki du monde", async () => {
    setup();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CatalogItemDetail item={EPEE} open onOpenChange={onOpenChange} />);
    await user.click(await screen.findByRole("button", { name: "La Forge" }));
    expect(push).toHaveBeenCalledWith("/w/w1?view=wiki&page=la-forge");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("avec le fournisseur de liens : la description est résolue et la page passe par lui", async () => {
    const onWikiLink = vi.fn();
    wikiLinks.value = { resolve: (m) => m.replace("[[La Forge]]", "[La Forge](wiki:la-forge)"), onWikiLink, onMapLink: vi.fn() };
    setup();
    const user = userEvent.setup();
    render(<CatalogItemDetail item={EPEE} open onOpenChange={() => {}} />);
    // Le lien de la description ET la pastille de la page portent le même nom :
    // on vise la pastille, dans sa section.
    const section = (await screen.findByText("Pages du wiki")).closest("section")!;
    await user.click(within(section).getByRole("button", { name: "La Forge" }));
    expect(onWikiLink).toHaveBeenCalledWith("la-forge");
    expect(push).not.toHaveBeenCalled();
  });

  it("sans description ni pages : le texte de repli, pas de section vide", async () => {
    setup([]);
    render(<CatalogItemDetail item={{ ...EPEE, description: null, properties: [] }} open onOpenChange={() => {}} />);
    expect(await screen.findByText("Aucune description.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Pages du wiki")).toBeNull());
  });
});

describe("fiche de persona → fiche de l'objet", () => {
  it("un clic sur un objet du catalogue ouvre sa fiche ; une saisie libre n'ouvre rien", async () => {
    setup();
    const user = userEvent.setup();
    render(
      <InventoryFieldView
        items={[
          { id: "i1", catalog_id: "c-epee", name: "Épée", quantity: 1 },
          { id: "i2", name: "Corde", quantity: 2 },
        ]}
        catalog={indexCatalog([EPEE])}
      />,
    );
    expect(screen.getByRole("button", { name: /Épée longue/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corde/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Épée longue/ }));
    expect(await screen.findByTestId("catalog-item-detail")).toHaveTextContent("Karsk");
  });
});
