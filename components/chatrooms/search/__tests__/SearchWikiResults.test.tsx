import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchWikiResults } from "@/components/chatrooms/search/SearchWikiResults";
import type { WikiSearchHit } from "@/lib/wikiSearch";

// ──────────────────────────────────────────────────────────────────────────
// Le centre de recherche ne fouillait que les messages : depuis un salon, le
// wiki était invisible.
// ──────────────────────────────────────────────────────────────────────────

const PAGES = new Map([
  ["p1", { title: "Arkham", slug: "arkham" }],
  ["p2", { title: "Le Hub central", slug: "le-hub-central" }],
]);

const HITS: WikiSearchHit[] = [
  { pageId: "p1", note: null, excerpt: "" },
  { pageId: "p2", note: { id: "n1", title: "Clé rouillée" }, excerpt: "…sous une dalle…" },
];

describe("SearchWikiResults", () => {
  it("nomme une page par son titre, une fiche par le sien avec sa page en chemin", () => {
    render(<SearchWikiResults hits={HITS} pagesById={PAGES} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^Arkham$/ })).toBeInTheDocument();
    // La fiche se nomme elle-même ; « Le Hub central » dit où elle est.
    const fiche = screen.getByRole("button", { name: /Clé rouillée/ });
    expect(fiche).toHaveTextContent("Le Hub central");
    expect(fiche).toHaveTextContent("sous une dalle");
  });

  it("ouvre la page visée, fiche comprise", async () => {
    const onSelect = vi.fn();
    render(<SearchWikiResults hits={HITS} pagesById={PAGES} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /Clé rouillée/ }));

    expect(onSelect).toHaveBeenCalledWith("le-hub-central");
  });

  it("ne montre rien sans résultat — la section n'a pas à annoncer le vide", () => {
    const { container } = render(<SearchWikiResults hits={[]} pagesById={PAGES} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
