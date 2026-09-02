import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WikiAnnotationLayer } from "@/components/worlds/wiki/WikiAnnotationLayer";
import type { WikiAnnotation, WikiAnnotationThread } from "@/types/worlds";

const PREMIER = "Mara Kline observe la ville.";
const DEUXIEME = "Les Gardiens veillent sur Meridian.";
const TROISIEME = "La nuit tombe sur le quartier haut.";

/** Fil ancré sur un bloc, à la façon dont l'écrit `useWikiAnnotations`. */
function surBloc(
  over: Partial<WikiAnnotation> & { id: string; anchor_quote: string; anchor_start: number },
): WikiAnnotationThread {
  return {
    root: {
      page_id: "p1",
      parent_id: null,
      author_id: "u1",
      body: "Un commentaire",
      anchor_block_type: "p",
      anchor_prefix: "",
      anchor_suffix: "",
      resolved_at: null,
      resolved_by: null,
      created_at: "2026-08-01T10:00:00.000Z",
      author: { id: "u1", username: "caedrik", avatar_url: null },
      ...over,
    },
    replies: [],
  };
}

/** Fil d'avant la migration 142 : une ancre de caractères, sans type de bloc. */
function surSelection(
  over: Partial<WikiAnnotation> & { id: string; anchor_quote: string },
): WikiAnnotationThread {
  const texte = `${PREMIER}${DEUXIEME}${TROISIEME}`;
  const start = texte.indexOf(over.anchor_quote);
  return {
    root: {
      page_id: "p1",
      parent_id: null,
      author_id: "u1",
      body: "Un commentaire",
      anchor_block_type: null,
      anchor_prefix: texte.slice(Math.max(0, start - 40), start),
      anchor_suffix: texte.slice(start + over.anchor_quote.length).slice(0, 40),
      anchor_start: start,
      resolved_at: null,
      resolved_by: null,
      created_at: "2026-08-01T10:00:00.000Z",
      author: { id: "u1", username: "caedrik", avatar_url: null },
      ...over,
    },
    replies: [],
  };
}

function article() {
  return (
    <div data-testid="prose">
      <p>{PREMIER}</p>
      <p>{DEUXIEME}</p>
      <p>{TROISIEME}</p>
    </div>
  );
}

function renderLayer(props: Partial<React.ComponentProps<typeof WikiAnnotationLayer>> = {}) {
  return render(
    <WikiAnnotationLayer
      contentKey="p1|v1"
      threads={[]}
      active={null}
      draftAnchor={null}
      canComment
      onActivate={vi.fn()}
      onDraft={vi.fn()}
      {...props}
    >
      {article()}
    </WikiAnnotationLayer>,
  );
}

/** Le paragraphe d'index donné dans le rendu. */
function paragraphe(container: HTMLElement, i: number): HTMLElement {
  return container.querySelectorAll("p")[i] as HTMLElement;
}

describe("WikiAnnotationLayer — marquage des blocs", () => {
  it("marque le bloc commenté sans toucher au texte", () => {
    const { container } = renderLayer({
      threads: [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })],
    });

    const marque = container.querySelector<HTMLElement>('[data-annotation-ids~="a1"]');
    expect(marque).toBe(paragraphe(container, 1));
    expect(screen.getByTestId("prose").textContent).toBe(PREMIER + DEUXIEME + TROISIEME);
  });

  it("suit le bloc quand un paragraphe est inséré avant lui", () => {
    // Le cas qui a motivé l'ancrage par bloc : l'index mémorisé ne vaut plus,
    // mais le texte du bloc, lui, n'a pas bougé.
    const { container } = render(
      <WikiAnnotationLayer
        contentKey="p1|v2"
        threads={[surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })]}
        active={null}
        draftAnchor={null}
        canComment
        onActivate={vi.fn()}
        onDraft={vi.fn()}
      >
        <div data-testid="prose">
          <p>Un ajout en tête.</p>
          <p>{PREMIER}</p>
          <p>{DEUXIEME}</p>
        </div>
      </WikiAnnotationLayer>,
    );

    expect(container.querySelector('[data-annotation-ids~="a1"]')).toBe(paragraphe(container, 2));
  });

  it("marque un fil résolu", () => {
    const { container } = renderLayer({
      threads: [surBloc({
        id: "a1",
        anchor_quote: DEUXIEME,
        anchor_start: 1,
        resolved_at: "2026-08-02T10:00:00.000Z",
      })],
    });

    expect(paragraphe(container, 1).dataset.annotationResolved).toBe("true");
  });

  it("laisse un bloc ouvert tant qu'un seul de ses fils l'est", () => {
    const { container } = renderLayer({
      threads: [
        surBloc({
          id: "a1",
          anchor_quote: DEUXIEME,
          anchor_start: 1,
          resolved_at: "2026-08-02T10:00:00.000Z",
        }),
        surBloc({ id: "a2", anchor_quote: DEUXIEME, anchor_start: 1 }),
      ],
    });

    const bloc = paragraphe(container, 1);
    expect(bloc.dataset.annotationIds).toBe("a1 a2");
    expect(bloc.dataset.annotationResolved).toBeUndefined();
    // Un clic ouvre le fil qui attend une réponse, pas le plus ancien.
    expect(bloc.dataset.annotationId).toBe("a2");
    // Un seul point en marge pour les deux fils : le panneau les liste.
    expect(bloc.dataset.annotationDraft).toBeUndefined();
  });

  it("signale les commentaires dont le bloc a disparu", () => {
    const onDetachedChange = vi.fn();
    renderLayer({
      threads: [
        surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 }),
        surBloc({ id: "perdue", anchor_quote: "Un paragraphe effacé depuis.", anchor_start: 2 }),
      ],
      onDetachedChange,
    });

    expect(onDetachedChange).toHaveBeenCalledWith(["perdue"]);
  });

  it("ne marque qu'une fois, même après un nouveau rendu du parent", () => {
    const threads = [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })];
    const { container, rerender } = renderLayer({ threads });

    rerender(
      <WikiAnnotationLayer
        contentKey="p1|v1"
        threads={[...threads]}
        active={null}
        draftAnchor={null}
        canComment
        onActivate={vi.fn()}
        onDraft={vi.fn()}
      >
        {article()}
      </WikiAnnotationLayer>,
    );

    expect(container.querySelectorAll('[data-annotation-ids~="a1"]')).toHaveLength(1);
    expect(screen.getByTestId("prose").textContent).toBe(PREMIER + DEUXIEME + TROISIEME);
  });

  it("garde ses marques quand React met le rendu à jour en place", async () => {
    // La panne : la couche ne remarquait qu'au remontage, sur une `key` censée
    // changer avec le texte. Or React met le rendu à jour EN PLACE dès que ses
    // données bougent pour une autre raison — lexique chargé après coup, liste
    // des pages rafraîchie, mise à jour temps réel. Les marques partaient avec
    // les nœuds remplacés, et rien ne les reposait.
    const threads = [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })];
    const { container, rerender } = renderLayer({ threads });
    expect(container.querySelector('[data-annotation-ids~="a1"]')).toBe(paragraphe(container, 1));

    // Même `contentKey`, mais un conteneur d'un autre type : React remplace
    // tout le sous-arbre au lieu de le réconcilier. Les paragraphes sont donc
    // des nœuds neufs, sans attribut — exactement ce que produit une
    // reconstruction du rendu markdown.
    rerender(
      <WikiAnnotationLayer
        contentKey="p1|v1"
        threads={threads}
        active={null}
        draftAnchor={null}
        canComment
        onActivate={vi.fn()}
        onDraft={vi.fn()}
      >
        <section data-testid="prose">
          <p>{PREMIER}</p>
          <p>{DEUXIEME}</p>
          <p>{TROISIEME}</p>
        </section>
      </WikiAnnotationLayer>,
    );

    expect(container.querySelector('[data-annotation-ids~="a1"]')).toBe(paragraphe(container, 1));
  });

  it("efface la marque d'un fil qui n'est plus là", () => {
    // Rejouer le marquage ne suffit pas : React garde souvent le même nœud,
    // qui conserverait sa marque d'un rendu à l'autre.
    const { container, rerender } = renderLayer({
      threads: [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })],
    });
    expect(paragraphe(container, 1).dataset.annotationIds).toBe("a1");

    rerender(
      <WikiAnnotationLayer
        contentKey="p1|v1"
        threads={[]}
        active={null}
        draftAnchor={null}
        canComment
        onActivate={vi.fn()}
        onDraft={vi.fn()}
      >
        {article()}
      </WikiAnnotationLayer>,
    );

    expect(paragraphe(container, 1).dataset.annotationIds).toBeUndefined();
  });

  it("met en avant le fil courant", () => {
    const { container } = renderLayer({
      threads: [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })],
      active: { id: "a1", scrollIntoView: false },
    });

    expect(paragraphe(container, 1).dataset.annotationActive).toBe("true");
  });
});

describe("WikiAnnotationLayer — commentaires d'avant l'ancrage par bloc", () => {
  it("rattache une ancre de sélection au bloc qui la contient", () => {
    // Aucune donnée n'a été convertie : ces commentaires se résolvent par leur
    // extrait, puis remontent au bloc.
    const { container } = renderLayer({
      threads: [surSelection({ id: "vieux", anchor_quote: "Les Gardiens" })],
    });

    expect(container.querySelector('[data-annotation-ids~="vieux"]')).toBe(paragraphe(container, 1));
  });

  it("les détache quand leur extrait a disparu", () => {
    const onDetachedChange = vi.fn();
    renderLayer({
      threads: [surSelection({ id: "vieux", anchor_quote: "Les Sentinelles" })],
      onDetachedChange,
    });

    expect(onDetachedChange).toHaveBeenCalledWith(["vieux"]);
  });
});

describe("WikiAnnotationLayer — clic sur un bloc commenté", () => {
  it("active le fil correspondant", async () => {
    const onActivate = vi.fn();
    const { container } = renderLayer({
      threads: [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })],
      onActivate,
    });

    await userEvent.click(paragraphe(container, 1));
    expect(onActivate).toHaveBeenCalledWith("a1");
  });
});

/** Fait répondre `matchMedia` comme un écran tactile, ou l'inverse. */
function auDoigt(oui: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: oui && query.includes("pointer: coarse"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("WikiAnnotationLayer — commandes de marge", () => {
  afterEach(() => auDoigt(false));

  it("ne montre le bouton d'un bloc qu'à son survol", async () => {
    // L'effacement passe par l'opacité et non par le montage : retirer le
    // bouton du flux déplacerait la pastille voisine au gré du pointeur.
    // jsdom ne calculant aucun style, la classe EST ce qui se vérifie ici.
    auDoigt(false);
    const { container } = renderLayer();
    const boutons = await screen.findAllByRole("button", { name: "Commenter" });
    expect(boutons.every(b => b.className.includes("opacity-0"))).toBe(true);

    fireEvent.mouseOver(paragraphe(container, 1));

    expect(boutons[1].className).toContain("opacity-100");
    expect(boutons[0].className).toContain("opacity-0");
  });

  it("les montre tous là où le survol n'existe pas", async () => {
    // Au doigt, un bouton qui attend un survol est introuvable.
    auDoigt(true);
    renderLayer();

    const boutons = await screen.findAllByRole("button", { name: "Commenter" });
    expect(boutons).toHaveLength(3);
    expect(boutons.every(b => b.className.includes("opacity-100"))).toBe(true);
  });

  it("ancre sur le bloc de sa commande", async () => {
    const onDraft = vi.fn();
    renderLayer({ onDraft });

    const boutons = await screen.findAllByRole("button", { name: "Commenter" });
    await userEvent.click(boutons[1]);

    expect(onDraft.mock.calls[0][0]).toMatchObject({ quote: DEUXIEME, index: 1 });
  });

  it("montre le compte des fils à droite du bouton", async () => {
    renderLayer({
      threads: [
        surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 }),
        surBloc({ id: "a2", anchor_quote: DEUXIEME, anchor_start: 1 }),
      ],
    });

    const pastille = await screen.findByRole("button", { name: "Commentaires" });
    expect(pastille.textContent).toBe("2");
  });

  it("ouvre le fil au clic sur la pastille", async () => {
    const onActivate = vi.fn();
    renderLayer({
      threads: [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })],
      onActivate,
    });

    await userEvent.click(await screen.findByRole("button", { name: "Commentaires" }));

    expect(onActivate).toHaveBeenCalledWith("a1");
  });

  it("laisse sa pastille à qui ne peut pas commenter, mais pas le bouton", async () => {
    // Lire une discussion ne demande pas le droit d'en ouvrir une.
    renderLayer({
      canComment: false,
      threads: [surBloc({ id: "a1", anchor_quote: DEUXIEME, anchor_start: 1 })],
    });

    expect(await screen.findByRole("button", { name: "Commentaires" })).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "Commenter" })).toHaveLength(0);
  });
});
