import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegionLayer } from "@/components/worlds/map/RegionLayer";
import { makeRegion } from "./fixtures";

/** L'image mesure 1000×1000 à l'écran : 100 px valent 10 %. */
const IMAGE = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
} as HTMLImageElement;

function monter(props: Partial<React.ComponentProps<typeof RegionLayer>> = {}) {
  const onSelect = vi.fn();
  const onPointsChanged = vi.fn();
  const onCloseDraft = vi.fn();
  const imgRef = { current: null } as React.RefObject<HTMLImageElement | null>;
  render(
    <RegionLayer
      regions={[makeRegion()]}
      selectedId={null}
      draft={null}
      isEditMode={false}
      imgRef={imgRef}
      onSelect={onSelect}
      onPointsChanged={onPointsChanged}
      onCloseDraft={onCloseDraft}
      {...props}
    />,
  );
  return { onSelect, onPointsChanged, onCloseDraft };
}

describe("RegionLayer", () => {
  it("dessine chaque région et pose son nom au centre", () => {
    monter();
    const polygone = screen.getByRole("button", { name: "Le royaume" });
    expect(polygone).toHaveAttribute("points", "20,20 60,20 60,60 20,60");
    // Le contour garde son épaisseur quelle que soit l'échelle.
    expect(polygone).toHaveAttribute("vector-effect", "non-scaling-stroke");

    const nom = document.querySelector("[data-region-label]") as HTMLElement;
    expect(nom).toHaveTextContent("Le royaume");
    expect(nom.style.left).toBe("40%");
    expect(nom.style.top).toBe("40%");
  });

  it("se choisit au clic, sans que la carte l'entende", async () => {
    const auDessus = vi.fn();
    const { onSelect } = (() => {
      const onSelect = vi.fn();
      render(
        <div onClick={auDessus}>
          <RegionLayer
            regions={[makeRegion()]}
            selectedId={null}
            draft={null}
            isEditMode={false}
            imgRef={{ current: null }}
            onSelect={onSelect}
            onPointsChanged={vi.fn()}
            onCloseDraft={vi.fn()}
          />
        </div>,
      );
      return { onSelect };
    })();

    await userEvent.click(screen.getByRole("button", { name: "Le royaume" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "reg1" }));
    expect(auDessus).not.toHaveBeenCalled();
  });

  it("se choisit aussi au clavier", async () => {
    const { onSelect } = monter();
    screen.getByRole("button", { name: "Le royaume" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalled();
  });

  it("montre le tracé en cours, sommet par sommet", () => {
    monter({ regions: [], draft: [{ x: 10, y: 10 }, { x: 30, y: 10 }] });
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(2);
    expect(document.querySelector("[data-region-draft]")).toHaveAttribute("points", "10,10 30,10");
  });

  it("ne dessine pas de contour pour un seul sommet", () => {
    monter({ regions: [], draft: [{ x: 10, y: 10 }] });
    expect(document.querySelector("[data-region-draft]")).toBeNull();
  });

  it("offre des poignées à la région choisie, en édition seulement", () => {
    monter({ selectedId: "reg1", isEditMode: true });
    expect(screen.getAllByRole("button", { name: /^Sommet \d$/ })).toHaveLength(4);
  });

  it("n'en offre pas en lecture", () => {
    monter({ selectedId: "reg1", isEditMode: false });
    expect(screen.queryByRole("button", { name: /^Sommet/ })).toBeNull();
  });

  it("déplace un sommet en le tirant", () => {
    // L'image fait 1000×1000 à l'écran : 100 px valent 10 %.
    const img = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) } as HTMLImageElement;
    const { onPointsChanged } = monter({ selectedId: "reg1", isEditMode: true, imgRef: { current: img } });

    const poignee = screen.getByRole("button", { name: "Sommet 1" });
    fireEvent.pointerDown(poignee, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(poignee, { clientX: 300, clientY: 250, pointerId: 1 });
    // Le polygone suit sans attendre le serveur.
    expect(screen.getByRole("button", { name: "Le royaume" })).toHaveAttribute("points", "30,25 60,20 60,60 20,60");
    fireEvent.pointerUp(poignee, { pointerId: 1 });

    // Le rappel porte les sommets d'après, pas l'index de celui qui a bougé :
    // les trois gestes disent la même chose.
    expect(onPointsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: "reg1" }),
      [{ x: 30, y: 25 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }],
    );
  });
});

describe("RegionLayer — le tracé guidé", () => {
  it("suit la souris : le sommet qu'on n'a pas encore posé", () => {
    // Sans cela on dessinait à l'aveugle jusqu'au clic suivant.
    monter({ regions: [], draft: [{ x: 10, y: 10 }, { x: 30, y: 10 }], imgRef: { current: IMAGE } });

    fireEvent.mouseMove(document.querySelector("[data-draft-surface]")!, { clientX: 400, clientY: 500 });

    expect(document.querySelector("[data-region-draft]")).toHaveAttribute("points", "10,10 30,10 40,50");
  });

  it("oublie ce sommet provisoire dès que la souris sort", () => {
    monter({ regions: [], draft: [{ x: 10, y: 10 }, { x: 30, y: 10 }], imgRef: { current: IMAGE } });
    const vitre = document.querySelector("[data-draft-surface]")!;

    fireEvent.mouseMove(vitre, { clientX: 400, clientY: 500 });
    fireEvent.mouseLeave(vitre);

    expect(document.querySelector("[data-region-draft]")).toHaveAttribute("points", "10,10 30,10");
  });

  it("fait du premier sommet la poignée de fermeture, une fois la région possible", async () => {
    // Revenir à son point de départ est le geste qu'on essaie d'abord.
    const { onCloseDraft } = monter({
      regions: [],
      draft: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 20, y: 40 }],
    });

    await userEvent.click(screen.getByRole("button", { name: "Fermer la région ici" }));

    expect(onCloseDraft).toHaveBeenCalled();
  });

  it("ne la propose pas tant qu'il n'y a pas de quoi faire une région", () => {
    monter({ regions: [], draft: [{ x: 10, y: 10 }, { x: 30, y: 10 }] });

    expect(screen.queryByRole("button", { name: "Fermer la région ici" })).toBeNull();
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(2);
  });
});

describe("RegionLayer — déplacer la région entière", () => {
  // Les sommets se déplaçaient un par un ; rien ne bougeait la forme d'un
  // bloc, alors qu'un lieu, lui, se déplace depuis toujours.
  const IMAGE = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
  } as HTMLImageElement;

  function polygone() {
    return screen.getByRole("button", { name: "Le royaume" });
  }

  /** Le carré de `makeRegion` : de 20 à 60 %, sur les deux axes. */
  function promener(de: { x: number; y: number }, vers: { x: number; y: number }) {
    fireEvent.pointerDown(polygone(), { clientX: de.x, clientY: de.y });
    fireEvent.pointerMove(polygone(), { clientX: vers.x, clientY: vers.y });
    fireEvent.pointerUp(polygone());
  }

  it("déplace les quatre sommets du même écart", () => {
    const { onPointsChanged } = monter({
      selectedId: "reg1",
      isEditMode: true,
      imgRef: { current: IMAGE },
    });

    promener({ x: 0, y: 0 }, { x: 100, y: 50 });

    expect(onPointsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: "reg1" }),
      [{ x: 30, y: 25 }, { x: 70, y: 25 }, { x: 70, y: 65 }, { x: 30, y: 65 }],
    );
  });

  it("garde la forme entière dans la carte", () => {
    // Borné point par point, un écart trop grand aurait écrasé contre le bord
    // les seuls sommets qui débordent — la région se serait déformée.
    const { onPointsChanged } = monter({
      selectedId: "reg1",
      isEditMode: true,
      imgRef: { current: IMAGE },
    });

    promener({ x: 0, y: 0 }, { x: 900, y: 0 });

    const [, points] = onPointsChanged.mock.calls[0];
    expect(points).toEqual([{ x: 60, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 60 }, { x: 60, y: 60 }]);
  });

  it("ne bouge pas pour un tremblement de la main", () => {
    const { onPointsChanged, onSelect } = monter({
      selectedId: "reg1",
      isEditMode: true,
      imgRef: { current: IMAGE },
    });

    promener({ x: 0, y: 0 }, { x: 2, y: 2 });
    fireEvent.click(polygone());

    expect(onPointsChanged).not.toHaveBeenCalled();
    // Et le clic qui suit choisit toujours la région.
    expect(onSelect).toHaveBeenCalled();
  });

  it("ne referme pas le panneau après un déplacement", () => {
    // Un déplacement se termine par un `click` : sans garde, il rejouait la
    // sélection et refermait le panneau de la région qu'on venait de bouger.
    const { onSelect } = monter({
      selectedId: "reg1",
      isEditMode: true,
      imgRef: { current: IMAGE },
    });

    promener({ x: 0, y: 0 }, { x: 100, y: 50 });
    fireEvent.click(polygone());

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ne se laisse prendre ni hors édition, ni sans être choisie", () => {
    // Une région couvre parfois la moitié de l'image : la carte doit rester
    // saisissable partout ailleurs.
    const { onPointsChanged } = monter({ selectedId: "reg1", isEditMode: false, imgRef: { current: IMAGE } });
    promener({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(onPointsChanged).not.toHaveBeenCalled();

    const autre = monter({ selectedId: null, isEditMode: true, imgRef: { current: IMAGE } });
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Le royaume" })[1], { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(screen.getAllByRole("button", { name: "Le royaume" })[1], { clientX: 100, clientY: 50 });
    fireEvent.pointerUp(screen.getAllByRole("button", { name: "Le royaume" })[1]);
    expect(autre.onPointsChanged).not.toHaveBeenCalled();
  });
});

describe("RegionLayer — ajouter un sommet sur un côté", () => {
  // Une région se dessine d'un trait et se corrige ensuite : sans cela, un
  // contour qu'on voulait affiner d'un cran obligeait à tout reprendre.
  function milieux() {
    return [...document.querySelectorAll("[data-region-midpoint]")] as HTMLElement[];
  }

  it("pose une poignée au milieu de chaque côté", () => {
    monter({ selectedId: "reg1", isEditMode: true });

    // Le carré de `makeRegion` : quatre côtés, donc quatre milieux.
    expect(milieux()).toHaveLength(4);
    expect(milieux()[0].style.left).toBe("40%");
    expect(milieux()[0].style.top).toBe("20%");
    // Le dernier referme la forme, du dernier sommet au premier.
    expect(milieux()[3].style.left).toBe("20%");
    expect(milieux()[3].style.top).toBe("40%");
  });

  it("insère le sommet entre les deux qu'il sépare", async () => {
    const { onPointsChanged } = monter({ selectedId: "reg1", isEditMode: true });

    await userEvent.click(milieux()[0]);

    expect(onPointsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: "reg1" }),
      // Le nouveau prend la deuxième place, pas la dernière : un polygone est
      // une suite ordonnée, et l'ajouter au bout croiserait le tracé.
      [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }],
    );
  });

  it("referme la forme sur le dernier côté", async () => {
    const { onPointsChanged } = monter({ selectedId: "reg1", isEditMode: true });

    await userEvent.click(milieux()[3]);

    const [, points] = onPointsChanged.mock.calls[0];
    expect(points).toHaveLength(5);
    expect(points[4]).toEqual({ x: 20, y: 40 });
  });

  it("ne les montre ni hors édition, ni sans région choisie", () => {
    monter({ selectedId: "reg1", isEditMode: false });
    expect(milieux()).toHaveLength(0);

    monter({ selectedId: null, isEditMode: true });
    expect(milieux()).toHaveLength(0);
  });

  it("ne laisse pas son clic atteindre la carte", async () => {
    // La carte referme le panneau ouvert sur tout clic hors de lui.
    const auDessus = vi.fn();
    render(
      <div onClick={auDessus}>
        <RegionLayer
          regions={[makeRegion()]}
          selectedId="reg1"
          draft={null}
          isEditMode
          imgRef={{ current: null }}
          onSelect={vi.fn()}
          onPointsChanged={vi.fn()}
          onCloseDraft={vi.fn()}
        />
      </div>,
    );

    await userEvent.click(milieux()[0]);

    expect(auDessus).not.toHaveBeenCalled();
  });
});
