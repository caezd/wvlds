import { describe, it, expect } from "vitest";

import { groupByColumn, UNCAT, COL_PREFIX } from "../catalogueTypes";
import type { WorldCatalogCategory } from "@/types/worlds";

// ──────────────────────────────────────────────────────────────────────────
// Le catalogue d'un monde s'affiche en colonnes de catégories, réordonnables
// au glisser-déposer. `groupByColumn` traduit la liste plate venue de la base
// en cette grille. Elle vivait dans un composant de 1 391 lignes, sans test,
// alors que c'est une fonction pure.
//
// Ce qui est vérifié : l'ordre voulu par l'utilisateur est respecté, et aucune
// colonne vide ne subsiste — un trou au milieu de la grille se voit tout de
// suite, et n'a aucune cause visible pour qui l'observe.
// ──────────────────────────────────────────────────────────────────────────

function categorie(
  id: string,
  column_index: number,
  sort_index: number,
): WorldCatalogCategory {
  return { id, world_id: "w1", type: "inventory", name: id, sort_index, column_index };
}

const ids = (colonnes: WorldCatalogCategory[][]) => colonnes.map((c) => c.map((x) => x.id));

describe("groupByColumn", () => {
  it("rend une grille vide pour une liste vide", () => {
    // `Math.max()` sans argument vaut -Infinity : sans ce cas particulier, la
    // construction du tableau de colonnes échouerait.
    expect(groupByColumn([])).toEqual([]);
  });

  it("range chaque catégorie dans sa colonne", () => {
    const grille = groupByColumn([
      categorie("a", 0, 0),
      categorie("b", 1, 0),
      categorie("c", 0, 1),
    ]);
    expect(ids(grille)).toEqual([["a", "c"], ["b"]]);
  });

  it("trie chaque colonne par rang, quel que soit l'ordre d'arrivée", () => {
    // La base ne garantit aucun ordre : le tri est ici, pas dans la requête.
    const grille = groupByColumn([
      categorie("troisieme", 0, 2),
      categorie("premier", 0, 0),
      categorie("deuxieme", 0, 1),
    ]);
    expect(ids(grille)).toEqual([["premier", "deuxieme", "troisieme"]]);
  });

  it("écarte les colonnes vides, sans décaler les autres", () => {
    // Supprimer la dernière catégorie d'une colonne laisserait sinon un blanc
    // au milieu de la grille.
    const grille = groupByColumn([categorie("a", 0, 0), categorie("b", 2, 0)]);
    expect(ids(grille)).toEqual([["a"], ["b"]]);
    expect(grille).toHaveLength(2);
  });

  it("ne modifie pas la liste reçue", () => {
    // Le tri porte sur une copie : la liste d'origine est l'état React du
    // composant, la trier sur place produirait un rendu incohérent.
    const source = [categorie("b", 0, 1), categorie("a", 0, 0)];
    const avant = source.map((c) => c.id);
    groupByColumn(source);
    expect(source.map((c) => c.id)).toEqual(avant);
  });

  it("conserve toutes les catégories", () => {
    const source = [
      categorie("a", 0, 0),
      categorie("b", 1, 0),
      categorie("c", 1, 1),
      categorie("d", 3, 0),
    ];
    expect(groupByColumn(source).flat()).toHaveLength(source.length);
  });
});

describe("identifiants réservés", () => {
  it("ne peuvent pas être confondus avec un identifiant de catégorie", () => {
    // Les deux servent de cibles de dépôt à côté des vrais identifiants, qui
    // sont des uuid. Une collision enverrait un objet dans la mauvaise colonne.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    expect(UNCAT).not.toMatch(UUID);
    expect(COL_PREFIX).not.toMatch(UUID);
    expect(UNCAT.startsWith(COL_PREFIX)).toBe(false);
  });
});
