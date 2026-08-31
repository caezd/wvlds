import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarkdownContent } from "@/components/MarkdownRenderer";

const TERMS = [{ id: "t1", world_id: "w1", term: "Dragon", description: "Une créature ancienne et redoutée." }];

describe("MarkdownContent — lexique du monde", () => {
  it("surligne automatiquement un terme du lexique présent dans le texte", () => {
    render(<MarkdownContent content="Un Dragon approche." lexiconTerms={TERMS} />);
    expect(screen.getByRole("button", { name: "Dragon" })).toBeInTheDocument();
  });

  it("affiche la description dans un popover au clic", async () => {
    const user = userEvent.setup();
    render(<MarkdownContent content="Un Dragon approche." lexiconTerms={TERMS} />);

    await user.click(screen.getByRole("button", { name: "Dragon" }));

    expect(await screen.findByText("Une créature ancienne et redoutée.")).toBeInTheDocument();
  });

  it("ne surligne rien sans lexiconTerms fourni (hors contexte wiki)", () => {
    render(<MarkdownContent content="Un Dragon approche." />);
    expect(screen.queryByRole("button", { name: "Dragon" })).not.toBeInTheDocument();
    expect(screen.getByText(/Un Dragon approche\.?/)).toBeInTheDocument();
  });

  it("rend un lien lexicon: vers un terme supprimé comme texte simple, non cliquable", () => {
    render(<MarkdownContent content="[Dragon](lexicon:terme-supprime)" lexiconTerms={TERMS} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Dragon")).toBeInTheDocument();
  });
});
