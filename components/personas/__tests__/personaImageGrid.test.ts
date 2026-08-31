import { describe, it, expect } from "vitest";
import {
  compactImageGridRows,
  fromRows,
  IMAGE_GRID_COLS,
  MIN_IMAGE_W,
  moveImage,
  resizeImage,
  resolvePersonaImageGrid,
  rowBoundaries,
  toPersonaGridImages,
  toRows,
  type PersonaImageGridItem,
} from "@/components/personas/personaImageGrid";

describe("resolvePersonaImageGrid", () => {
  it("conserve une grille déjà positionnée telle quelle (bg vrai par défaut)", () => {
    const raw = [
      { id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3 },
      { id: "b", url: "https://x/b.png", x: 3, y: 0, w: 3 },
    ];
    expect(resolvePersonaImageGrid(raw)).toEqual(raw.map((item) => ({ ...item, bg: true })));
  });

  it("préserve bg:false, ignore toute autre valeur non-false", () => {
    const raw = [
      { id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3, bg: false },
      { id: "b", url: "https://x/b.png", x: 3, y: 0, w: 3, bg: "nope" },
    ];
    const resolved = resolvePersonaImageGrid(raw);
    expect(resolved.find((i) => i.id === "a")!.bg).toBe(false);
    expect(resolved.find((i) => i.id === "b")!.bg).toBe(true);
  });

  it("place automatiquement une image sans position (upload tout juste ajouté)", () => {
    const raw = [{ id: "a", url: "https://x/a.png" }];
    const resolved = resolvePersonaImageGrid(raw);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ id: "a", url: "https://x/a.png", x: 0, y: 0 });
    expect(resolved[0].w).toBeGreaterThanOrEqual(MIN_IMAGE_W);
  });

  it("place deux images sans position sur la même ligne, à la suite des images déjà placées", () => {
    const raw = [
      { id: "a", url: "https://x/a.png", x: 0, y: 0, w: 6 },
      { id: "b", url: "https://x/b.png" },
      { id: "c", url: "https://x/c.png" },
    ];
    const resolved = resolvePersonaImageGrid(raw);
    const [a, b, c] = resolved;
    expect(a.y).toBe(0);
    expect(b.y).toBe(1);
    expect(c.y).toBe(1);
    expect(b.x).not.toBe(c.x);
  });

  it("filtre une URL non http(s) (javascript:, data:…)", () => {
    const raw = [{ id: "a", url: "javascript:alert(1)", x: 0, y: 0, w: 3 }];
    expect(resolvePersonaImageGrid(raw)).toEqual([]);
  });

  it("déduplique les id répétés (ne garde que la première occurrence)", () => {
    const raw = [
      { id: "a", url: "https://x/1.png", x: 0, y: 0, w: 3 },
      { id: "a", url: "https://x/2.png", x: 3, y: 0, w: 3 },
    ];
    const resolved = resolvePersonaImageGrid(raw);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].url).toBe("https://x/1.png");
  });

  it("clampe une largeur qui déborderait la grille", () => {
    const raw = [{ id: "a", url: "https://x/a.png", x: 4, y: 0, w: 6 }];
    const resolved = resolvePersonaImageGrid(raw);
    expect(resolved[0].w).toBe(IMAGE_GRID_COLS - 4);
  });

  it("ignore une entrée qui n'est pas un objet", () => {
    expect(resolvePersonaImageGrid([null, "x", 42])).toEqual([]);
  });

  it("renvoie [] pour une valeur non-tableau", () => {
    expect(resolvePersonaImageGrid(undefined)).toEqual([]);
    expect(resolvePersonaImageGrid(null)).toEqual([]);
  });

  it("tronque une légende trop longue", () => {
    const raw = [{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3, caption: "x".repeat(500) }];
    const resolved = resolvePersonaImageGrid(raw);
    expect(resolved[0].caption?.length).toBeLessThanOrEqual(200);
  });
});

describe("toPersonaGridImages", () => {
  it("convertit une grille résolue vers la forme stockée (bg:true omis, comportement par défaut)", () => {
    const items: PersonaImageGridItem[] = [{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3, bg: true }];
    expect(toPersonaGridImages(items)).toEqual([{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3 }]);
  });

  it("conserve bg:false explicitement", () => {
    const items: PersonaImageGridItem[] = [{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3, bg: false }];
    expect(toPersonaGridImages(items)).toEqual([{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3, bg: false }]);
  });
});

describe("toRows / fromRows / compactImageGridRows", () => {
  const items: PersonaImageGridItem[] = [
    { id: "a", url: "u", x: 0, y: 0, w: 3, bg: true },
    { id: "b", url: "u", x: 3, y: 0, w: 3, bg: true },
    { id: "c", url: "u", x: 0, y: 2, w: 6, bg: true },
  ];

  it("regroupe par ligne, triée de gauche à droite", () => {
    expect(toRows(items)).toEqual([
      [items[0], items[1]],
      [items[2]],
    ]);
  });

  it("fromRows renumérote les lignes et recalcule x", () => {
    const rows = [[items[2]], [items[0], items[1]]];
    expect(fromRows(rows)).toEqual([
      { ...items[2], y: 0 },
      { ...items[0], y: 1 },
      { ...items[1], x: 3, y: 1 },
    ]);
  });

  it("compacte les lignes trouées (y=2 devient y=1 après suppression de y=1)", () => {
    expect(compactImageGridRows(items).map((i) => i.y)).toEqual([0, 0, 1]);
  });
});

describe("resizeImage", () => {
  it("agrandit une image sans voisin jusqu'au bord de la grille", () => {
    const items: PersonaImageGridItem[] = [{ id: "a", url: "u", x: 0, y: 0, w: 3, bg: true }];
    const resized = resizeImage(items, "a", "e", 2);
    expect(resized[0].w).toBe(5);
  });

  it("redimensionne en tandem avec le voisin de droite (largeur totale préservée)", () => {
    const items: PersonaImageGridItem[] = [
      { id: "a", url: "u", x: 0, y: 0, w: 3, bg: true },
      { id: "b", url: "u", x: 3, y: 0, w: 3, bg: true },
    ];
    const resized = resizeImage(items, "a", "e", 1);
    const a = resized.find((i) => i.id === "a")!;
    const b = resized.find((i) => i.id === "b")!;
    expect(a.w).toBe(4);
    expect(b.x).toBe(4);
    expect(b.w).toBe(2);
  });

  it("ne descend jamais sous la largeur minimale", () => {
    const items: PersonaImageGridItem[] = [
      { id: "a", url: "u", x: 0, y: 0, w: MIN_IMAGE_W, bg: true },
      { id: "b", url: "u", x: MIN_IMAGE_W, y: 0, w: MIN_IMAGE_W, bg: true },
    ];
    const resized = resizeImage(items, "a", "e", -5);
    expect(resized.find((i) => i.id === "a")!.w).toBe(MIN_IMAGE_W);
  });

  it("ignore un id inconnu", () => {
    const items: PersonaImageGridItem[] = [{ id: "a", url: "u", x: 0, y: 0, w: 3, bg: true }];
    expect(resizeImage(items, "missing", "e", 1)).toEqual(items);
  });
});

describe("moveImage", () => {
  it("déplace une image vers une nouvelle ligne", () => {
    const items: PersonaImageGridItem[] = [
      { id: "a", url: "u", x: 0, y: 0, w: 3, bg: true },
      { id: "b", url: "u", x: 3, y: 0, w: 3, bg: true },
    ];
    const moved = moveImage(items, "a", 1, 0, true);
    const a = moved.find((i) => i.id === "a")!;
    expect(a.y).toBe(1);
    expect(a.w).toBe(IMAGE_GRID_COLS);
  });

  it("insère une image dans une ligne existante et redistribue la largeur", () => {
    const items: PersonaImageGridItem[] = [
      { id: "a", url: "u", x: 0, y: 0, w: IMAGE_GRID_COLS, bg: true },
      { id: "b", url: "u", x: 0, y: 1, w: IMAGE_GRID_COLS, bg: true },
    ];
    const moved = moveImage(items, "b", 0, IMAGE_GRID_COLS - 1, false);
    expect(toRows(moved)).toHaveLength(1);
    expect(moved.every((i) => i.w === IMAGE_GRID_COLS / 2)).toBe(true);
  });

  it("repositionne une image seule sur sa ligne sans la redimensionner (recentrage)", () => {
    // Régression : redéposer une image sur sa propre ligne, alors vide une
    // fois elle-même exclue, ne doit pas la faire passer en pleine largeur
    // via distributeRow — juste décaler son x, largeur inchangée.
    const items: PersonaImageGridItem[] = [{ id: "a", url: "u", x: 0, y: 0, w: 3, bg: true }];
    const moved = moveImage(items, "a", 0, 2, false);
    const a = moved.find((i) => i.id === "a")!;
    expect(a.w).toBe(3);
    expect(a.x).toBe(2);
  });

  it("clampe le repositionnement pour ne pas dépasser le bord de la grille", () => {
    const items: PersonaImageGridItem[] = [{ id: "a", url: "u", x: 0, y: 0, w: 3, bg: true }];
    const moved = moveImage(items, "a", 0, 999, false);
    expect(moved.find((i) => i.id === "a")!.x).toBe(IMAGE_GRID_COLS - 3);
  });
});

describe("rowBoundaries", () => {
  it("une frontière par paire de voisins sur une même ligne", () => {
    const items: PersonaImageGridItem[] = [
      { id: "a", url: "u", x: 0, y: 0, w: 2, bg: true },
      { id: "b", url: "u", x: 2, y: 0, w: 2, bg: true },
      { id: "c", url: "u", x: 4, y: 0, w: 2, bg: true },
    ];
    expect(rowBoundaries(items)).toEqual([
      { left: items[0], right: items[1] },
      { left: items[1], right: items[2] },
    ]);
  });
});
