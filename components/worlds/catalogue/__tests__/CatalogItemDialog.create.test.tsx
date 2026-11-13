import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// La conversion passe par un canvas, que jsdom n'a pas : le fichier ressort
// tel quel, seul le chemin d'envoi nous intéresse ici.
vi.mock("@/lib/imageUtils", async (original) => ({
  ...(await original<typeof import("@/lib/imageUtils")>()),
  toWebP: vi.fn(async (file: File) => new File([file], "img.webp", { type: "image/webp" })),
}));

const setWorldCatalogItemPages = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/app/actions/worldCatalog", () => ({ setWorldCatalogItemPages }));

import { CatalogItemDialog } from "@/components/worlds/catalogue/CatalogItemDialog";

const DRAFT = {
  id: "3f2b1c5e-8d4a-4a6b-9c1d-2e5f7a8b9c0d", world_id: "w1", type: "inventory" as const, category_id: null,
  name: "", description: null, icon: null, lucide_icon: null, image_url: null, rarity: null,
  stackable: true, max_quantity: null, properties: [], sort_index: 0,
};

describe("CatalogItemDialog — création", () => {
  let mock: ReturnType<typeof createSupabaseMock>;
  beforeEach(() => {
    mock = createSupabaseMock();
    vi.mocked(createClient).mockReturnValue(mock.client as never);
  });

  it("se présente en création : titre, « Créer » et « Créer et continuer »", () => {
    render(
      <CatalogItemDialog item={DRAFT} type="skills" worldId="w1" open creating
        onOpenChange={vi.fn()} onSave={vi.fn()} onSaveAndContinue={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "Nouvelle compétence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Créer et continuer" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("en modification, pas de « Créer et continuer »", () => {
    render(
      <CatalogItemDialog item={{ ...DRAFT, name: "Épée" }} type="inventory" worldId="w1" open
        onOpenChange={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "Modifier l’objet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /continuer/ })).toBeNull();
  });

  it("téléverse l'image dans le dossier du brouillon, et l'efface si l'on annule", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CatalogItemDialog item={DRAFT} type="inventory" worldId="w1" open creating
        onOpenChange={onOpenChange} onSave={vi.fn()} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "epee.png", { type: "image/png" }));

    await waitFor(() => expect(mock.storageUpload).toHaveBeenCalled());
    const [chemin] = mock.storageUpload.mock.calls[0] as [string];
    expect(chemin).toMatch(new RegExp(`^world-w1/item-${DRAFT.id}/`));

    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(mock.storageRemove).toHaveBeenCalledWith([chemin]));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("« Créer » envoie l'image téléversée avec le reste", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CatalogItemDialog item={DRAFT} type="inventory" worldId="w1" open creating
        onOpenChange={vi.fn()} onSave={onSave} />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "epee.png", { type: "image/png" }));
    await waitFor(() => expect(mock.storageUpload).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText("Nom de l'objet"), "Épée");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(DRAFT.id, expect.objectContaining({
      name: "Épée",
      image_url: expect.stringContaining(`world-w1/item-${DRAFT.id}/`),
      icon: null,
      lucide_icon: null,
    })));
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });
});

describe("CatalogItemDialog — pages du wiki liées (migration 186)", () => {
  const PAGES = [
    { id: "pg1", title: "La Forge", slug: "la-forge", icon: null },
    { id: "pg2", title: "Karsk", slug: "karsk", icon: "castle" },
  ];

  beforeEach(() => setWorldCatalogItemPages.mockClear());

  it("en modification : les pages liées s'affichent, on en ajoute une, l'enregistrement remplace la liste", async () => {
    // Ordre des `.from()` : world_catalog_item_pages (les liées, effet du
    // dialogue) puis world_wiki_pages (le sélecteur, monté dans le portail).
    const mock = createSupabaseMock({
      results: [
        { data: [{ sort_index: 0, page: { ...PAGES[0], deleted_at: null } }] },
        { data: PAGES },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CatalogItemDialog item={{ ...DRAFT, name: "Épée" }} type="inventory" worldId="w1" open
        onOpenChange={vi.fn()} onSave={onSave} />,
    );

    expect(await screen.findByText("La Forge")).toBeInTheDocument();
    // Le sélecteur (Popover) s'ouvre par-dessus le dialogue modal et reste
    // cliquable : les deux couches Radix partagent la même
    // `react-dismissable-layer` — avec deux copies du paquet, la couche du
    // dessus héritait du `pointer-events: none` posé sur le corps par le
    // dialogue, et rien ne répondait au clic.
    await user.click(screen.getByRole("button", { name: "Lier une page" }));
    await user.click(await screen.findByRole("option", { name: /Karsk/ }));
    expect(screen.getByRole("button", { name: "Retirer la page Karsk" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(setWorldCatalogItemPages).toHaveBeenCalledWith(DRAFT.id, ["pg1", "pg2"]));
  });

  it("sans changement des pages, l'enregistrement ne les réécrit pas", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }, { data: PAGES }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CatalogItemDialog item={{ ...DRAFT, name: "Épée" }} type="inventory" worldId="w1" open
        onOpenChange={vi.fn()} onSave={onSave} />,
    );
    await screen.findByRole("button", { name: "Lier une page" });
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(setWorldCatalogItemPages).not.toHaveBeenCalled();
  });
});
