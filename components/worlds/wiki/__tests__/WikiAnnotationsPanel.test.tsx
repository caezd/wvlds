import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WikiAnnotationsPanel } from "@/components/worlds/wiki/WikiAnnotationsPanel";
import type { WikiAnnotation, WikiAnnotationThread } from "@/types/worlds";

function annotation(over: Partial<WikiAnnotation> & { id: string }): WikiAnnotation {
  return {
    page_id: "p1",
    parent_id: null,
    author_id: "u1",
    body: "Un commentaire",
    anchor_quote: "Les Gardiens",
    anchor_prefix: "",
    anchor_suffix: "",
    anchor_start: 0,
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    author: { id: "u1", username: "caedrik", avatar_url: null },
    ...over,
  };
}

function thread(over: Partial<WikiAnnotation> & { id: string }, replies: WikiAnnotation[] = []): WikiAnnotationThread {
  return { root: annotation(over), replies };
}

// Radix verrouille `document.body` (`pointer-events: none`) tant qu'une
// modale est ouverte, et ne le relâche qu'à la fermeture — que le démontage
// brutal de RTL entre deux tests n'exécute pas. Sans ce nettoyage, le premier
// test qui ouvre le dialogue de suppression rend le body inerte pour tous les
// suivants.
beforeEach(() => {
  document.body.style.pointerEvents = "";
});

function renderPanel(props: Partial<React.ComponentProps<typeof WikiAnnotationsPanel>> = {}) {
  const handlers = {
    onActivate: vi.fn(),
    onCreate: vi.fn(),
    onCancelDraft: vi.fn(),
    onReply: vi.fn().mockResolvedValue(undefined),
    onSetResolved: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
  const utils = render(
    <WikiAnnotationsPanel
      threads={[]}
      detachedIds={new Set()}
      loading={false}
      pending={false}
      activeId={null}
      draft={null}
      currentUserId="u1"
      canModerate
      {...handlers}
      {...props}
    />,
  );
  return { ...utils, ...handlers };
}

describe("WikiAnnotationsPanel — liste", () => {
  it("invite à sélectionner un passage quand la page n'a aucun commentaire", () => {
    renderPanel();
    expect(screen.getByText(/Aucun commentaire\./)).toBeTruthy();
  });

  it("classe les fils dans l'ordre du texte", () => {
    renderPanel({
      threads: [
        thread({ id: "bas", body: "Plus bas", anchor_start: 400 }),
        thread({ id: "haut", body: "Plus haut", anchor_start: 10 }),
      ],
    });
    const bodies = screen.getAllByText(/^Plus (haut|bas)$/).map(el => el.textContent);
    expect(bodies).toEqual(["Plus haut", "Plus bas"]);
  });

  it("renvoie les fils détachés en fin de liste, signalés comme tels", () => {
    renderPanel({
      threads: [
        thread({ id: "perdu", body: "Fil détaché", anchor_start: 0 }),
        thread({ id: "ancré", body: "Fil ancré", anchor_start: 100 }),
      ],
      detachedIds: new Set(["perdu"]),
    });
    const bodies = screen.getAllByText(/^Fil (ancré|détaché)$/).map(el => el.textContent);
    expect(bodies).toEqual(["Fil ancré", "Fil détaché"]);
    expect(screen.getByText("Détachée")).toBeTruthy();
  });

  it("affiche les réponses sous leur fil", () => {
    renderPanel({
      threads: [
        thread({ id: "a1", body: "La question" }, [
          annotation({ id: "r1", parent_id: "a1", body: "La réponse", anchor_quote: null, anchor_start: null }),
        ]),
      ],
    });
    expect(screen.getByText("La question")).toBeTruthy();
    expect(screen.getByText("La réponse")).toBeTruthy();
  });
});

describe("WikiAnnotationsPanel — fils résolus", () => {
  it("masque les fils résolus par défaut, et les révèle à la demande", async () => {
    renderPanel({
      threads: [
        thread({ id: "a1", body: "Encore ouvert" }),
        thread({ id: "a2", body: "Déjà réglé", resolved_at: "2026-08-02T10:00:00.000Z", resolved_by: "u1" }),
      ],
    });

    expect(screen.queryByText("Déjà réglé")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Résolus" }));
    expect(screen.getByText("Déjà réglé")).toBeTruthy();
    expect(screen.getByText("Encore ouvert")).toBeTruthy();
  });

});

describe("WikiAnnotationsPanel — écriture", () => {
  it("compose la première annotation d'un passage sélectionné", async () => {
    const { onCreate } = renderPanel({
      draft: {
            anchor: { quote: "Les Gardiens", prefix: "", suffix: "", start: 0 },
      },
    });

    // L'extrait visé est rappelé au-dessus de la saisie.
    expect(screen.getByText("Les Gardiens")).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox"), "Qui les a créés ?");
    await userEvent.click(screen.getByRole("button", { name: "Commenter" }));

    expect(onCreate).toHaveBeenCalledWith("Qui les a créés ?");
  });

  it("refuse de publier un commentaire vide", () => {
    renderPanel({
      draft: { anchor: { quote: "Meridian", prefix: "", suffix: "", start: 0 } },
    });
    expect(screen.getByRole("button", { name: "Commenter" }).hasAttribute("disabled")).toBe(true);
  });

  it("répond dans un fil existant", async () => {
    const { onReply } = renderPanel({ threads: [thread({ id: "a1" })] });

    await userEvent.click(screen.getByRole("button", { name: "Répondre" }));
    await userEvent.type(screen.getByRole("textbox"), "Bonne question.");
    await userEvent.click(screen.getAllByRole("button", { name: "Répondre" })[0]);

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply.mock.calls[0][1]).toBe("Bonne question.");
  });

  it("marque un fil comme résolu", async () => {
    const { onSetResolved } = renderPanel({ threads: [thread({ id: "a1" })] });

    await userEvent.click(screen.getByRole("button", { name: "Actions du fil" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Marquer comme résolu" }));

    expect(onSetResolved).toHaveBeenCalledTimes(1);
    expect(onSetResolved.mock.calls[0][1]).toBe(true);
  });

  it("propose de rouvrir un fil déjà résolu", async () => {
    const { onSetResolved } = renderPanel({
      threads: [thread({ id: "a1", resolved_at: "2026-08-02T10:00:00.000Z", resolved_by: "u1" })],
    });

    await userEvent.click(screen.getByRole("button", { name: "Résolus" }));
    await userEvent.click(screen.getByRole("button", { name: "Actions du fil" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rouvrir" }));

    expect(onSetResolved.mock.calls[0][1]).toBe(false);
  });

  it("demande confirmation avant de supprimer", async () => {
    const { onDelete } = renderPanel({ threads: [thread({ id: "a1" })] });

    await userEvent.click(screen.getByRole("button", { name: "Actions du fil" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0][0].id).toBe("a1");
  });

  it("ne propose pas de supprimer le fil d'un autre à un simple membre", async () => {
    renderPanel({
      threads: [thread({ id: "a1", author_id: "quelquun-dautre" })],
      canModerate: false,
      currentUserId: "u1",
    });

    await userEvent.click(screen.getByRole("button", { name: "Actions du fil" }));
    expect(screen.queryByRole("menuitem", { name: "Supprimer" })).toBeNull();
  });
});
