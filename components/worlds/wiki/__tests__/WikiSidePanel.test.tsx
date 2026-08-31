import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WikiSidePanel } from "@/components/worlds/wiki/WikiSidePanel";

function renderShell(props: Partial<React.ComponentProps<typeof WikiSidePanel>> = {}) {
  const onTabChange = vi.fn();
  const vue = render(
    <WikiSidePanel
      tab="comments"
      onTabChange={onTabChange}
      openCommentCount={0}
      width={320}
      {...props}
    >
      <p>contenu du panneau</p>
    </WikiSidePanel>,
  );
  return { ...vue, onTabChange };
}

describe("WikiSidePanel", () => {
  it("propose les deux contenus et marque celui qu'on regarde", () => {
    renderShell({ tab: "notes" });

    const commentaires = screen.getByRole("tab", { name: /Commentaires/ });
    const notes = screen.getByRole("tab", { name: /Notes/ });
    expect(notes.getAttribute("aria-selected")).toBe("true");
    expect(commentaires.getAttribute("aria-selected")).toBe("false");
  });

  it("bascule d'un contenu à l'autre", async () => {
    const { onTabChange } = renderShell({ tab: "comments" });

    await userEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(onTabChange).toHaveBeenCalledWith("notes");
  });

  it("annonce le nombre de fils ouverts sur l'onglet des commentaires", () => {
    renderShell({ openCommentCount: 2 });
    expect(within(screen.getByRole("tab", { name: /Commentaires/ })).getByText("2")).toBeTruthy();
  });

  it("ne montre aucun compteur quand aucun fil n'est ouvert", () => {
    renderShell({ openCommentCount: 0 });
    expect(screen.queryByText("0")).toBeNull();
  });

  it("nomme la colonne d'après ce qu'elle montre", () => {
    // Un lecteur d'écran doit entendre le contenu, pas le nom du meuble.
    const { rerender } = renderShell({ tab: "comments" });
    expect(screen.getByRole("complementary", { name: "Commentaires" })).toBeTruthy();

    rerender(
      <WikiSidePanel tab="notes" onTabChange={vi.fn()} openCommentCount={0} width={320}>
        <p>contenu du panneau</p>
      </WikiSidePanel>,
    );
    expect(screen.getByRole("complementary", { name: "Notes" })).toBeTruthy();
  });

  it("reste en place : rien ne la referme", () => {
    // La colonne est permanente depuis qu'elle ne dépend plus d'un bouton
    // d'en-tête, qui disputait sa place au titre de la page.
    renderShell();
    expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  });

  it("prend la largeur qu'on lui donne", () => {
    const { container } = renderShell({ width: 420 });
    const colonne = container.querySelector("aside")!;
    expect(colonne.style.width).toBe("420px");
  });

  it("n'offre de poignée de redimensionnement qu'en mode modification", () => {
    // Même règle que l'arbre de navigation : la largeur se règle là où le
    // reste de la page se règle.
    const { container, rerender } = renderShell();
    expect(container.querySelector(".cursor-col-resize")).toBeNull();

    rerender(
      <WikiSidePanel
        tab="comments"
        onTabChange={vi.fn()}
        openCommentCount={0}
        width={320}
        handleProps={{}}
      >
        <p>contenu du panneau</p>
      </WikiSidePanel>,
    );
    expect(container.querySelector(".cursor-col-resize")).not.toBeNull();
  });

  it("affiche le contenu qu'on lui confie", () => {
    renderShell();
    expect(screen.getByText("contenu du panneau")).toBeTruthy();
  });
});
