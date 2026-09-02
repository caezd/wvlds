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

    expect(onWikiLink).toHaveBeenCalledWith("accueil", undefined);
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

describe("MarkdownContent — sections et images", () => {
  it("transmet la section visée par un lien", async () => {
    const onWikiLink = vi.fn();
    render(<MarkdownContent content="[Le port](wiki:arkham#le-port)" onWikiLink={onWikiLink} />);

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    expect(onWikiLink).toHaveBeenCalledWith("arkham", "le-port");
  });

  it("accepte une section sans page : on reste où l'on est", async () => {
    const onWikiLink = vi.fn();
    render(<MarkdownContent content="[Le port](wiki:#le-port)" onWikiLink={onWikiLink} />);

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    expect(onWikiLink).toHaveBeenCalledWith("", "le-port");
  });

  it("pose sur chaque titre l'identifiant qu'une section vise", () => {
    render(<MarkdownContent content="## Le port" />);

    expect(screen.getByRole("heading", { name: "Le port" }).id).toBe("le-port");
  });

  it("ouvre l'image cliquée quand une visionneuse est offerte", async () => {
    // Une image d'article était un `<img>` nu : cliquer ne faisait rien, là où
    // un salon ouvre sa visionneuse depuis toujours.
    const onImageOpen = vi.fn();
    render(
      <MarkdownContent
        content="![Carte](https://x.test/a.webp)"
        allowImages
        onImageOpen={onImageOpen}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(onImageOpen).toHaveBeenCalledWith("https://x.test/a.webp");
  });

  it("laisse l'image nue quand aucune visionneuse n'est offerte", () => {
    // Hors du wiki — dans un message de salon — la bulle a déjà la sienne.
    render(<MarkdownContent content="![Carte](https://x.test/a.webp)" allowImages />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByAltText("Carte")).toBeInTheDocument();
  });
});
