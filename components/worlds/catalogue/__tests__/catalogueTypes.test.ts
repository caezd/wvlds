import { describe, it, expect } from "vitest";

import { appendPosition, boardOrder, moveCategory, UNCAT } from "../catalogueTypes";
import type { WorldCatalogCategory } from "@/types/worlds";

// ──────────────────────────────────────────────────────────────────────────
// Le catalogue d'un monde est un tableau : une colonne par catégorie, de
// gauche à droite. La base garde, de l'ancienne grille, un numéro de colonne
// ET un rang ; le tableau les lit comme un seul ordre (colonne, puis rang), et
// réécrit un ordre simple (colonne 0, rang 0…n) dès qu'on déplace une
// catégorie.
// ──────────────────────────────────────────────────────────────────────────

function categorie(id: string, column_index: number, sort_index: number): WorldCatalogCategory {
  return { id, world_id: "w1", type: "inventory", name: id, sort_index, column_index };
}

const ids = (cats: WorldCatalogCategory[]) => cats.map((c) => c.id);

describe("boardOrder", () => {
  it("lit l'ancienne grille colonne par colonne, puis par rang", () => {
    const ordre = boardOrder([
      categorie("c", 1, 0),
      categorie("b", 0, 1),
      categorie("a", 0, 0),
      categorie("d", 2, 0),
    ]);
    expect(ids(ordre)).toEqual(["a", "b", "c", "d"]);
  });

  it("ne modifie pas la liste reçue", () => {
    // La liste d'origine est l'état React du composant : la trier sur place
    // produirait un rendu incohérent.
    const source = [categorie("b", 0, 1), categorie("a", 0, 0)];
    boardOrder(source);
    expect(ids(source)).toEqual(["b", "a"]);
  });
});

describe("moveCategory", () => {
  const source = [categorie("a", 0, 0), categorie("b", 0, 1), categorie("c", 1, 0)];

  it("déplace une colonne à la place d'une autre et renumérote tout le tableau", () => {
    const suite = moveCategory(source, "c", "a")!;
    expect(ids(suite)).toEqual(["c", "a", "b"]);
    expect(suite.map((c) => [c.sort_index, c.column_index])).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it("vers la droite aussi", () => {
    expect(ids(moveCategory(source, "a", "c")!)).toEqual(["b", "c", "a"]);
  });

  it("rien à faire : sur elle-même, ou vers l'inconnu", () => {
    expect(moveCategory(source, "a", "a")).toBeNull();
    expect(moveCategory(source, "a", "zz")).toBeNull();
    expect(moveCategory(source, UNCAT, "a")).toBeNull();
  });
});

describe("appendPosition", () => {
  it("un tableau vide commence à 0", () => {
    expect(appendPosition([])).toEqual({ column_index: 0, sort_index: 0 });
  });

  it("une nouvelle catégorie va au bout du tableau, même sur une ancienne grille", () => {
    const pos = appendPosition([categorie("a", 0, 0), categorie("b", 0, 1), categorie("c", 2, 4)]);
    expect(pos).toEqual({ column_index: 2, sort_index: 5 });
    expect(ids(boardOrder([categorie("a", 0, 0), categorie("c", 2, 4), { ...categorie("n", 0, 0), ...pos }])).at(-1)).toBe("n");
  });
});

describe("identifiant réservé", () => {
  it("ne peut pas être confondu avec un identifiant de catégorie", () => {
    // Il sert de cible de dépôt à côté des vrais identifiants, qui sont des
    // uuid. Une collision enverrait un objet dans la mauvaise colonne.
    expect(UNCAT).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});
