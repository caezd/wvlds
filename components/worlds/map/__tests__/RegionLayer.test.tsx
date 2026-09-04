import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegionLayer } from "@/components/worlds/map/RegionLayer";
import { makeRegion } from "./fixtures";

function monter(props: Partial<React.ComponentProps<typeof RegionLayer>> = {}) {
  const onSelect = vi.fn();
  const onVertexMoved = vi.fn();
  const imgRef = { current: null } as React.RefObject<HTMLImageElement | null>;
  render(
    <RegionLayer
      regions={[makeRegion()]}
      selectedId={null}
      draft={null}
      isEditMode={false}
      imgRef={imgRef}
      onSelect={onSelect}
      onVertexMoved={onVertexMoved}
      {...props}
    />,
  );
  return { onSelect, onVertexMoved };
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
            onVertexMoved={vi.fn()}
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
    const { onVertexMoved } = monter({ selectedId: "reg1", isEditMode: true, imgRef: { current: img } });

    const poignee = screen.getByRole("button", { name: "Sommet 1" });
    fireEvent.pointerDown(poignee, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(poignee, { clientX: 300, clientY: 250, pointerId: 1 });
    // Le polygone suit sans attendre le serveur.
    expect(screen.getByRole("button", { name: "Le royaume" })).toHaveAttribute("points", "30,25 60,20 60,60 20,60");
    fireEvent.pointerUp(poignee, { pointerId: 1 });

    expect(onVertexMoved).toHaveBeenCalledWith(expect.objectContaining({ id: "reg1" }), 0, { x: 30, y: 25 });
  });
});
