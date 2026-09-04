import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PinSearchHit } from "@/lib/wikiSearch";
import { SearchMapResults } from "@/components/chatrooms/search/SearchMapResults";

// ──────────────────────────────────────────────────────────────────────────
// Les lieux de la carte qui répondent à la recherche libre — la carte restait
// muette dans le centre de recherche.
// ──────────────────────────────────────────────────────────────────────────

const HITS: PinSearchHit[] = [
  { pinId: "pin1", mapId: "m1", title: "Le port", excerpt: "" },
  { pinId: "pin2", mapId: "m2", title: "La tour", excerpt: "…on y entend le port la nuit…" },
];

describe("SearchMapResults", () => {
  it("ne rend rien sans résultat", () => {
    const { container } = render(<SearchMapResults hits={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nomme chaque lieu, avec son extrait quand le titre ne suffit pas", () => {
    render(<SearchMapResults hits={HITS} onSelect={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Sur la carte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Le port/ })).toBeInTheDocument();
    expect(screen.getByText("…on y entend le port la nuit…")).toBeInTheDocument();
  });

  it("rend le lieu choisi, carte comprise", async () => {
    const onSelect = vi.fn();
    render(<SearchMapResults hits={HITS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /La tour/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pinId: "pin2", mapId: "m2" }));
  });
});
