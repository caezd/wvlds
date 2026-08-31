import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/components/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

import { WikiNotesPanel } from "@/components/worlds/wiki/WikiNotesPanel";

const CATEGORIES = [
  { id: "c1", page_id: "p1", name: "Entités", sort_index: 0 },
  { id: "c2", page_id: "p1", name: "Lieux", sort_index: 1 },
];

const NOTES = [
  { id: "n1", category_id: "c1", page_id: "p1", title: "Mara Kline", body: "Analyste système.", sort_index: 0 },
  { id: "n2", category_id: "c1", page_id: "p1", title: "Les Gardiens", body: "", sort_index: 1 },
  { id: "n3", category_id: "c2", page_id: "p1", title: "Meridian", body: "La métropole.", sort_index: 0 },
];

beforeEach(() => {
  // `localStorage.clear` manque au localStorage de l'environnement de test :
  // on retire la seule clé que le panneau écrit.
  try { localStorage.removeItem("wiki-notes-collapsed:p1"); } catch { /* rien à nettoyer */ }
});

function renderPanel(
  results: { data?: unknown; error?: unknown }[],
  props: { isEditMode?: boolean } = {},
) {
  const mock = createSupabaseMock({ results });
  const vue = render(
    <WikiNotesPanel
      pageId="p1"
      worldId="w1"
      isEditMode={props.isEditMode ?? true}
      supabase={mock.client as never}
    />,
  );
  return { ...vue, mock };
}

const CHARGEMENT = [{ data: CATEGORIES, error: null }, { data: NOTES, error: null }];

describe("WikiNotesPanel — lecture", () => {
  it("liste les catégories et leurs fiches", async () => {
    renderPanel(CHARGEMENT);

    expect(await screen.findByText("Entités")).toBeTruthy();
    expect(screen.getByText("Lieux")).toBeTruthy();
    expect(screen.getByText("Mara Kline")).toBeTruthy();
    expect(screen.getByText("Meridian")).toBeTruthy();
  });

  it("compte les fiches de chaque catégorie", async () => {
    renderPanel(CHARGEMENT);
    await screen.findByText("Entités");
    // « Entités » en contient deux, « Lieux » une seule.
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("garde le contenu d'une fiche replié jusqu'au clic", async () => {
    const user = userEvent.setup();
    renderPanel(CHARGEMENT);

    await screen.findByText("Mara Kline");
    expect(screen.queryByText("Analyste système.")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Mara Kline/ }));
    expect(screen.getByText("Analyste système.")).toBeTruthy();
  });

  it("annonce une fiche sans contenu plutôt que d'ouvrir sur du vide", async () => {
    const user = userEvent.setup();
    renderPanel(CHARGEMENT);

    await screen.findByText("Les Gardiens");
    await user.click(screen.getByRole("button", { name: /Les Gardiens/ }));
    expect(screen.getByText("Fiche sans contenu.")).toBeTruthy();
  });

  it("replie une catégorie sans toucher aux autres", async () => {
    // Le pli est mémorisé en localStorage, d'une visite à l'autre. Cette
    // persistance-là n'est pas vérifiable ici : le localStorage de
    // l'environnement de test accepte les écritures sans rien conserver.
    const user = userEvent.setup();
    renderPanel(CHARGEMENT);

    await screen.findByText("Mara Kline");
    await user.click(screen.getByRole("button", { name: /Entités/ }));

    expect(screen.queryByText("Mara Kline")).toBeNull();
    expect(screen.getByText("Meridian")).toBeTruthy();
  });

  it("propose une ossature quand la page n'a aucune note", async () => {
    renderPanel([{ data: [], error: null }, { data: [], error: null }]);

    expect(await screen.findByRole("button", { name: "+ Vue d'ensemble" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Entités" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Moments" })).toBeTruthy();
  });

});

describe("WikiNotesPanel — hors mode modification", () => {
  it("ne montre aucune commande d'édition", async () => {
    renderPanel(CHARGEMENT, { isEditMode: false });

    await screen.findByText("Entités");
    expect(screen.queryByRole("button", { name: "Nouvelle catégorie" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions de la catégorie" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions de la fiche" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Déplacer la fiche" })).toBeNull();
  });

  it("annonce l'absence de notes sans proposer d'en créer", async () => {
    renderPanel([{ data: [], error: null }, { data: [], error: null }], { isEditMode: false });

    expect(await screen.findByText("Aucune note pour cette page.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Entités" })).toBeNull();
  });
});

describe("WikiNotesPanel — écriture", () => {
  it("crée une catégorie", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([
      ...CHARGEMENT,
      { data: { id: "c3", page_id: "p1", name: "Moments", sort_index: 2 }, error: null },
    ]);

    await screen.findByText("Entités");
    await user.click(screen.getByRole("button", { name: "Nouvelle catégorie" }));
    await user.type(screen.getByPlaceholderText("Nom de la catégorie…"), "Moments{Enter}");

    await waitFor(() =>
      expect(mock.builders[2].builder.insert.mock.calls[0][0]).toMatchObject({ name: "Moments" }),
    );
  });

  it("crée une fiche dans sa catégorie", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([
      ...CHARGEMENT,
      { data: { id: "n4", category_id: "c2", page_id: "p1", title: "Le Hub", body: "", sort_index: 1 }, error: null },
    ]);

    // La catégorie « Lieux » porte deux commandes « Nouvelle fiche » — le +
    // de son en-tête et le bouton sous ses fiches : on vise la sienne, pas
    // celle de la catégorie voisine.
    const lieux = (await screen.findByText("Lieux")).closest("section")!;
    await user.click(within(lieux).getAllByRole("button", { name: /Nouvelle fiche/ })[0]);
    await user.type(screen.getByPlaceholderText("Titre de la fiche…"), "Le Hub{Enter}");

    await waitFor(() =>
      expect(mock.builders[2].builder.insert.mock.calls[0][0]).toMatchObject({
        category_id: "c2",
        title: "Le Hub",
      }),
    );
  });

  it("modifie le titre et le contenu d'une fiche", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([...CHARGEMENT, { data: null, error: null }]);

    await screen.findByText("Mara Kline");
    const fiche = screen.getByText("Mara Kline").closest("li")!;
    await user.click(within(fiche).getByRole("button", { name: "Actions de la fiche" }));
    await user.click(await screen.findByRole("menuitem", { name: "Modifier" }));

    const titre = screen.getByDisplayValue("Mara Kline");
    await user.clear(titre);
    await user.type(titre, "Mara K.");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mock.builders[2].builder.update.mock.calls[0][0]).toMatchObject({ title: "Mara K." }),
    );
  });

  it("renomme une catégorie", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([...CHARGEMENT, { data: null, error: null }]);

    await screen.findByText("Entités");
    await user.click(screen.getAllByRole("button", { name: "Actions de la catégorie" })[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Renommer" }));

    const champ = screen.getByDisplayValue("Entités");
    await user.clear(champ);
    await user.type(champ, "Personnages{Enter}");

    await waitFor(() =>
      expect(mock.builders[2].builder.update.mock.calls[0][0]).toMatchObject({ name: "Personnages" }),
    );
  });

  it("demande confirmation avant de supprimer une catégorie", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([...CHARGEMENT, { data: null, error: null }]);

    await screen.findByText("Entités");
    await user.click(screen.getAllByRole("button", { name: "Actions de la catégorie" })[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));

    expect(await screen.findByText(/Supprimer « Entités » \?/)).toBeTruthy();
    expect(mock.builders).toHaveLength(2); // rien d'écrit avant confirmation

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mock.builders[2].builder.delete).toHaveBeenCalled());
  });

  it("demande confirmation avant de supprimer une fiche", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([...CHARGEMENT, { data: null, error: null }]);

    await screen.findByText("Mara Kline");
    const fiche = screen.getByText("Mara Kline").closest("li")!;
    await user.click(within(fiche).getByRole("button", { name: "Actions de la fiche" }));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));

    expect(await screen.findByText(/Supprimer « Mara Kline » \?/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mock.builders[2].builder.delete).toHaveBeenCalled());
  });

  it("crée la catégorie suggérée d'un clic", async () => {
    const user = userEvent.setup();
    const { mock } = renderPanel([
      { data: [], error: null },
      { data: [], error: null },
      { data: { id: "c1", page_id: "p1", name: "Entités", sort_index: 0 }, error: null },
    ]);

    await user.click(await screen.findByRole("button", { name: "+ Entités" }));
    await waitFor(() =>
      expect(mock.builders[2].builder.insert.mock.calls[0][0]).toMatchObject({
        name: "Entités",
        sort_index: 0,
      }),
    );
  });
});
