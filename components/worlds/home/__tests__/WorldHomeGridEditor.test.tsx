import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import type { WorldHomeGridItem } from "@/components/worlds/home/worldHomeGrid";

const setWorldHomeGridMock = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldHomeGrid: (...args: unknown[]) => setWorldHomeGridMock(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { WorldHomeGridEditor, getContentWidth } from "@/components/worlds/home/WorldHomeGridEditor";

function Harness({ initial, onPersisted }: { initial: WorldHomeGridItem[]; onPersisted?: () => void }) {
  const [items, setItems] = React.useState(initial);
  return <WorldHomeGridEditor worldId="w1" items={items} onItemsChange={setItems} onPersisted={onPersisted} />;
}

const CHATROOMS_ITEM: WorldHomeGridItem = { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" };
const HTML_ITEM: WorldHomeGridItem = { id: "b", type: "html", x: 0, y: 4, w: 12, html: "<p>x</p>" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getContentWidth", () => {
  it("exclut le border et le padding du conteneur, pas seulement getBoundingClientRect", () => {
    // Régression : mesurer via getBoundingClientRect() (boîte englobante,
    // border + padding inclus) surdimensionnait la grille en continu — le
    // conteneur de l'éditeur a son propre border + p-2. getComputedStyle()
    // résout toujours la largeur de CONTENU, même sous box-sizing: border-box.
    const node = { clientWidth: 316 } as HTMLElement;
    const restore = window.getComputedStyle;
    window.getComputedStyle = () =>
      ({ width: "300px", paddingLeft: "8px", paddingRight: "8px" }) as CSSStyleDeclaration;
    try {
      expect(getContentWidth(node)).toBe(300);
    } finally {
      window.getComputedStyle = restore;
    }
  });

  it("retombe sur clientWidth moins le padding si `width` n'est pas un nombre exploitable", () => {
    const node = { clientWidth: 316 } as HTMLElement;
    const restore = window.getComputedStyle;
    window.getComputedStyle = () =>
      ({ width: "auto", paddingLeft: "8px", paddingRight: "8px" }) as CSSStyleDeclaration;
    try {
      expect(getContentWidth(node)).toBe(300);
    } finally {
      window.getComputedStyle = restore;
    }
  });
});

describe("WorldHomeGridEditor", () => {
  it("désactive la transition CSS de react-grid-layout, qui jouait aussi au montage", () => {
    // Régression : `.react-grid-item`/`.react-grid-layout` animent en continu
    // (transition CSS de la librairie) tout changement de position/hauteur,
    // y compris au montage — un bloc qui vient d'apparaître glissait
    // visiblement vers sa position au lieu d'y être direct, perceptible en
    // changeant d'onglet dans les réglages (l'éditeur est remonté).
    const { container } = render(<Harness initial={[CHATROOMS_ITEM]} />);

    expect(container.querySelector(".react-grid-layout")).toHaveClass("!transition-none");
    expect(container.querySelector(".react-grid-item")).toHaveClass("!transition-none");
  });

  it("affiche les blocs existants et ne propose que les widgets non utilisés dans le menu", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    expect(screen.getAllByText("Salons").length).toBeGreaterThan(0);

    await user.click(screen.getByText("Ajouter un widget"));
    expect(screen.getByRole("menuitem", { name: "Catégories" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Salons" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Annonce" })).not.toBeInTheDocument();
  });

  it("ajoute un widget et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM, { ...CHATROOMS_ITEM, id: "new", widgetId: "categories" }] });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ widgetId: "categories" })]),
      );
    });
  });

  it("ajoute un bloc html via l'éditeur de contenu et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [{ id: "new", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }] });
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByText("Ajouter un bloc"));
    await user.click(screen.getByRole("menuitem", { name: "Bloc HTML" }));
    await user.type(screen.getByLabelText("HTML / CSS"), "<p>Salut</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ type: "html", html: "<p>Salut</p>" })]),
      );
    });
  });

  it("ajoute un bloc markdown via l'éditeur de contenu et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [{ id: "new", type: "markdown", x: 0, y: 0, w: 12, content: "Salut" }] });
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByText("Ajouter un bloc"));
    await user.click(screen.getByRole("menuitem", { name: "Bloc Markdown" }));
    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ type: "markdown", content: "Salut" })]),
      );
    });
  });

  it("modifie le contenu d'un bloc html existant via le crayon", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [{ ...HTML_ITEM, html: "<p>y</p>" }] });
    const user = userEvent.setup();
    render(<Harness initial={[HTML_ITEM]} />);

    await user.click(screen.getByLabelText("Modifier le bloc"));
    const field = screen.getByLabelText("HTML / CSS");
    await user.clear(field);
    await user.type(field, "<p>y</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        [expect.objectContaining({ id: "b", type: "html", html: "<p>y</p>" })],
      );
    });
  });

  it("identifie un bloc html par son titre libre, sinon par son type", () => {
    render(
      <Harness
        initial={[
          { ...HTML_ITEM, id: "titré", title: "Bandeau d'accueil" },
          { id: "sans-titre", type: "markdown", x: 0, y: 2, w: 12, content: "# Salut" },
        ]}
      />,
    );

    expect(screen.getByText("Bandeau d'accueil")).toBeInTheDocument();
    // Sans titre, le libellé retombe sur le type — jamais un extrait du
    // contenu, qui serait illisible.
    expect(screen.getByText("Bloc Markdown")).toBeInTheDocument();
    expect(screen.queryByText(/# Salut/)).not.toBeInTheDocument();
  });

  it("n'affiche l'icône de réglages que pour les widgets qui en déclarent", async () => {
    render(<Harness initial={[CHATROOMS_ITEM, { id: "c", type: "widget", x: 0, y: 1, w: 12, widgetId: "categories" }]} />);
    // « Salons » déclare visibleRows, « Catégories » ne déclare rien.
    expect(screen.getAllByLabelText("Réglages du bloc")).toHaveLength(1);
  });

  it("persiste les réglages à la fermeture du popover, pas à chaque frappe", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByLabelText("Réglages du bloc"));
    const field = await screen.findByLabelText("Lignes visibles");
    await user.clear(field);
    await user.type(field, "3");
    // Rien n'est encore parti côté serveur pendant la saisie.
    expect(setWorldHomeGridMock).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        [expect.objectContaining({ options: { visibleRows: 3 } })],
      );
    });
  });

  it("supprime un bloc après confirmation", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [] });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByLabelText("Supprimer"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith("w1", []);
    });
  });

  it("annule le changement optimiste et affiche une erreur si la persistance échoue", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: false, error: "nope" });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("nope");
    });
    // Le widget ajouté de façon optimiste disparaît après le rollback.
    await waitFor(() => {
      expect(screen.queryByText("Catégories")).not.toBeInTheDocument();
    });
  });

  it("ignore la réponse d'un enregistrement dépassé par un plus récent", async () => {
    // Deux gestes rapprochés : la réponse du premier arrive après celle du
    // second et ne doit pas ramener son état (périmé) à l'écran.
    let resolveFirst!: (v: unknown) => void;
    setWorldHomeGridMock
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({
        ok: true,
        items: [CHATROOMS_ITEM, { ...CHATROOMS_ITEM, id: "second", widgetId: "personas_recent" }],
      });

    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));
    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Personas récents" }));

    await waitFor(() => {
      expect(screen.getAllByText("Personas récents").length).toBeGreaterThan(0);
    });

    // La réponse tardive du premier enregistrement ne doit rien réécrire.
    resolveFirst({ ok: true, items: [CHATROOMS_ITEM, { ...CHATROOMS_ITEM, id: "first", widgetId: "categories" }] });

    await waitFor(() => {
      expect(screen.getAllByText("Personas récents").length).toBeGreaterThan(0);
    });
  });

  it("appelle onPersisted une fois l'écriture confirmée", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const onPersisted = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} onPersisted={onPersisted} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));

    await waitFor(() => {
      expect(onPersisted).toHaveBeenCalled();
    });
  });
});
