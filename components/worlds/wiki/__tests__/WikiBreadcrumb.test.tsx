import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WikiBreadcrumb } from "@/components/worlds/wiki/WikiBreadcrumb";
import type { WikiPage } from "@/components/worlds/wiki/WorldWiki";

function makeFolder(id: string, title: string): WikiPage {
  return {
    id,
    world_id: "w1",
    parent_id: null,
    title,
    slug: title.toLowerCase(),
    content: null,
    is_folder: true,
    sort_index: 0,
    icon: null,
    is_restricted: false,
    banner_url: null,
    description: null,
    draft_updated_at: null,
    published_at: null,
  };
}

describe("WikiBreadcrumb", () => {
  it("ne rend rien pour une page racine (sans ancêtres)", () => {
    const { container } = render(<WikiBreadcrumb ancestors={[]} onExpandFolder={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche les segments du plus ancien au plus proche", () => {
    render(
      <WikiBreadcrumb
        ancestors={[makeFolder("f1", "Lieux"), makeFolder("f2", "Villes")]}
        onExpandFolder={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map(b => b.textContent)).toEqual(["Lieux", "Villes"]);
  });

  it("ouvre chaque segment d'une barre oblique, comme l'en-tête d'un salon", () => {
    const { container } = render(
      <WikiBreadcrumb
        ancestors={[makeFolder("f1", "Lieux"), makeFolder("f2", "Villes")]}
        onExpandFolder={vi.fn()}
      />,
    );
    // Le fil suit le nom du wiki dans le même bandeau : sans séparateur en
    // tête, « Annexes Lieux » se lirait comme un seul titre.
    expect(container.textContent).toBe("/Lieux/Villes");
  });

  it("déplie le dossier correspondant au clic d'un segment", async () => {
    const onExpandFolder = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiBreadcrumb
        ancestors={[makeFolder("f1", "Lieux"), makeFolder("f2", "Villes")]}
        onExpandFolder={onExpandFolder}
      />,
    );
    await user.click(screen.getByText("Villes"));
    expect(onExpandFolder).toHaveBeenCalledWith("f2");
  });
});
