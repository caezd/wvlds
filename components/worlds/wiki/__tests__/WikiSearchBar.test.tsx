import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WikiSearchBar, type WikiSearchResult } from "@/components/worlds/wiki/WikiSearchBar";
import type { WikiPage } from "@/components/worlds/wiki/WorldWiki";

function makePage(id: string, title: string): WikiPage {
  return {
    id,
    world_id: "w1",
    parent_id: null,
    title,
    slug: title.toLowerCase(),
    content: null,
    is_folder: false,
    sort_index: 0,
    icon: null,
    is_restricted: false,
    draft_updated_at: null,
    published_at: null,
  };
}

describe("WikiSearchBar", () => {
  it("n'affiche aucune liste de résultats tant qu'aucune recherche n'est active", () => {
    render(
      <WikiSearchBar query="" onQueryChange={vi.fn()} results={null} onSelectResult={vi.fn()} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("affiche un message quand la recherche ne donne aucun résultat", () => {
    render(
      <WikiSearchBar query="xyz" onQueryChange={vi.fn()} results={[]} onSelectResult={vi.fn()} />,
    );
    expect(screen.getByText("Aucun résultat.")).toBeInTheDocument();
  });

  it("affiche les résultats avec titre, chemin et extrait", () => {
    const results: WikiSearchResult[] = [
      { page: makePage("p1", "La Forêt Noire"), path: "Lieux", excerpt: "…une forêt sombre…" },
    ];
    render(
      <WikiSearchBar query="forêt" onQueryChange={vi.fn()} results={results} onSelectResult={vi.fn()} />,
    );
    expect(screen.getByText("La Forêt Noire")).toBeInTheDocument();
    expect(screen.getByText("Lieux")).toBeInTheDocument();
    expect(screen.getByText("…une forêt sombre…")).toBeInTheDocument();
  });

  it("sélectionne un résultat au clic", async () => {
    const onSelectResult = vi.fn();
    const results: WikiSearchResult[] = [
      { page: makePage("p1", "Accueil"), path: "", excerpt: "" },
    ];
    const user = userEvent.setup();
    render(
      <WikiSearchBar query="acc" onQueryChange={vi.fn()} results={results} onSelectResult={onSelectResult} />,
    );
    await user.click(screen.getByText("Accueil"));
    expect(onSelectResult).toHaveBeenCalledWith("p1");
  });

  it("efface la recherche via le bouton X", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiSearchBar query="forêt" onQueryChange={onQueryChange} results={[]} onSelectResult={vi.fn()} />,
    );
    await user.click(screen.getByLabelText("Effacer la recherche"));
    expect(onQueryChange).toHaveBeenCalledWith("");
  });
});
