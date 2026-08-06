import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarkdownContent } from "@/components/MarkdownRenderer";

describe("MarkdownContent — liens wiki:", () => {
  it("rend un lien wiki: valide en bouton cliquable qui appelle onWikiLink", async () => {
    const onWikiLink = vi.fn();
    render(<MarkdownContent content="[Accueil](wiki:accueil)" onWikiLink={onWikiLink} />);

    const button = screen.getByRole("button", { name: "Accueil" });
    await userEvent.click(button);

    expect(onWikiLink).toHaveBeenCalledWith("accueil");
  });

  it("rend un lien vers un slug vide (page introuvable) comme cassé, non cliquable", () => {
    const onWikiLink = vi.fn();
    render(<MarkdownContent content="[Titre inconnu](wiki:)" onWikiLink={onWikiLink} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const span = screen.getByText("Titre inconnu");
    expect(span.className).toContain("text-destructive");
  });

  it("rend un lien wiki: comme cassé quand aucun onWikiLink n'est fourni (hors contexte wiki)", () => {
    render(<MarkdownContent content="[Accueil](wiki:accueil)" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Accueil")).toBeInTheDocument();
  });
});
