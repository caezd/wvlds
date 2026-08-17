import { describe, it, expect } from "vitest";
import {
  compactHomeGridRows,
  findRightNeighbor,
  HOME_GRID_COLS,
  MAX_HOME_GRID_ITEMS,
  resolveWorldHomeGrid,
  sanitizeWidgetOptions,
  widgetOptionValue,
  type WorldHomeGridItem,
} from "@/components/worlds/home/worldHomeGrid";

describe("resolveWorldHomeGrid — home_grid valide", () => {
  it("utilise la grille telle quelle quand elle est valide et non vide", () => {
    const grid: WorldHomeGridItem[] = [
      { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
      { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "categories" },
    ];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual(grid);
  });

  it("respecte une grille vide explicite (admin ayant retiré tous les blocs)", () => {
    expect(resolveWorldHomeGrid([], ["chatrooms"], null)).toEqual([]);
  });

  it("filtre un widgetId inconnu (widget supprimé depuis)", () => {
    const grid = [{ id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "ancien_widget" }];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
  });

  it("rejette l'id 'announcement' comme widgetId — retiré au profit des blocs html", () => {
    const grid = [{ id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "announcement" }];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
  });

  it("déduplique les widgetId répétés (ne garde que la première occurrence)", () => {
    const grid = [
      { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
      { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
    ];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual([grid[0]]);
  });

  it("déduplique les id répétés (ne garde que la première occurrence)", () => {
    const grid = [
      { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
      { id: "a", type: "widget", x: 6, y: 0, w: 6, widgetId: "categories" },
    ];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual([grid[0]]);
  });

  it("filtre les coordonnées non entières, négatives ou nulles", () => {
    const grid = [
      { id: "a", type: "widget", x: -1, y: 0, w: 6, widgetId: "chatrooms" },
      { id: "b", type: "widget", x: 0, y: 0, w: 1.5, widgetId: "categories" },
      { id: "c", type: "widget", x: 0, y: 0, w: 0, widgetId: "stats" },
    ];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
  });

  it("clampe une largeur qui déborderait la grille plutôt que de rejeter le bloc", () => {
    const grid = [{ id: "a", type: "widget", x: 8, y: 0, w: 10, widgetId: "chatrooms" }];
    const resolved = resolveWorldHomeGrid(grid, null, null);
    expect(resolved).toEqual([{ id: "a", type: "widget", x: 8, y: 0, w: HOME_GRID_COLS - 8, widgetId: "chatrooms" }]);
  });

  it("rejette un bloc dont le clamp de largeur tomberait sous le minimum de 2", () => {
    const grid = [{ id: "a", type: "widget", x: 11, y: 0, w: 6, widgetId: "chatrooms" }];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
  });

  it("rejette un bloc widget qui porte aussi du contenu html/markdown", () => {
    const grid = [{ id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms", html: "<p>x</p>" }];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
  });

  it("accepte un bloc html avec du contenu", () => {
    const grid: WorldHomeGridItem[] = [{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual(grid);
  });

  it("accepte un bloc markdown avec du contenu", () => {
    const grid: WorldHomeGridItem[] = [{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "# Titre" }];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual(grid);
  });

  it("tronque au nombre maximal de blocs", () => {
    const grid = Array.from({ length: MAX_HOME_GRID_ITEMS + 5 }, (_, i) => ({
      id: `b${i}`,
      type: "markdown" as const,
      x: 0,
      y: i,
      w: 12,
      content: "x",
    }));
    expect(resolveWorldHomeGrid(grid, null, null)).toHaveLength(MAX_HOME_GRID_ITEMS);
  });

  it("retombe sur la synthèse legacy si tous les items sont invalides", () => {
    const grid = [{ id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "inconnu" }];
    const resolved = resolveWorldHomeGrid(grid, ["stats"], null);
    expect(resolved).toEqual([{ id: "stats", type: "widget", x: 0, y: 0, w: HOME_GRID_COLS, widgetId: "stats" }]);
  });
});

describe("resolveWorldHomeGrid — synthèse depuis l'ancien système", () => {
  it("retombe sur la grille par défaut quand rien n'a jamais été personnalisé", () => {
    const resolved = resolveWorldHomeGrid(null, null, null);
    expect(resolved.map((i) => i.widgetId)).toEqual(["categories", "composer", "chatrooms"]);
    expect(resolved.every((i) => i.x === 0 && i.w === HOME_GRID_COLS)).toBe(true);
  });

  it("respecte un home_layout vide explicite (grille vide, pas la grille par défaut)", () => {
    expect(resolveWorldHomeGrid(null, [], null)).toEqual([]);
  });

  it("synthétise un bloc par widget de l'ancien home_layout, une ligne chacun", () => {
    const resolved = resolveWorldHomeGrid(null, ["chatrooms", "stats"], null);
    expect(resolved.map((i) => i.widgetId)).toEqual(["chatrooms", "stats"]);
    expect(resolved.map((i) => i.y)).toEqual([0, 1]);
  });

  it("replie l'ancienne annonce en bloc html à sa position d'origine dans la pile", () => {
    const resolved = resolveWorldHomeGrid(null, ["categories", "announcement", "chatrooms"], "<p>Annonce</p>");
    expect(resolved.map((i) => i.type)).toEqual(["widget", "html", "widget"]);
    expect(resolved[1]).toMatchObject({ type: "html", html: "<p>Annonce</p>" });
    expect(resolved[2].widgetId).toBe("chatrooms");
  });

  it("omet l'ancienne annonce si son HTML est vide", () => {
    const resolved = resolveWorldHomeGrid(null, ["categories", "announcement", "chatrooms"], null);
    expect(resolved.map((i) => i.widgetId ?? i.type)).toEqual(["categories", "chatrooms"]);
  });
});

describe("réglages de widget (options)", () => {
  it("retourne la valeur par défaut quand aucun réglage n'est enregistré", () => {
    expect(widgetOptionValue("chatrooms", "visibleRows", undefined)).toBe(8);
  });

  it("retourne la valeur enregistrée quand elle est dans les bornes", () => {
    expect(widgetOptionValue("chatrooms", "visibleRows", { visibleRows: 12 })).toBe(12);
  });

  it("borne une valeur hors limites plutôt que de la propager", () => {
    expect(widgetOptionValue("chatrooms", "visibleRows", { visibleRows: 999 })).toBe(50);
    expect(widgetOptionValue("chatrooms", "visibleRows", { visibleRows: 0 })).toBe(1);
  });

  it("retourne 0 pour un widget sans réglage déclaré", () => {
    expect(widgetOptionValue("stats", "visibleRows", { visibleRows: 4 })).toBe(0);
  });

  it("sanitizeWidgetOptions écarte les clés inconnues", () => {
    expect(sanitizeWidgetOptions("chatrooms", { visibleRows: 5, inconnu: 3 })).toEqual({ visibleRows: 5 });
  });

  it("sanitizeWidgetOptions borne les valeurs au registre", () => {
    expect(sanitizeWidgetOptions("wiki_shortcuts", { limit: 999 })).toEqual({ limit: 20 });
  });

  it("sanitizeWidgetOptions retourne undefined plutôt qu'un objet vide", () => {
    expect(sanitizeWidgetOptions("chatrooms", { inconnu: 3 })).toBeUndefined();
    expect(sanitizeWidgetOptions("stats", { visibleRows: 4 })).toBeUndefined();
  });

  it("les réglages valides survivent à la résolution de la grille", () => {
    const grid = [
      { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms", options: { visibleRows: 5 } },
    ];
    expect(resolveWorldHomeGrid(grid, null, null)[0].options).toEqual({ visibleRows: 5 });
  });

  it("un réglage hors bornes est borné à la résolution, pas rejeté avec le bloc", () => {
    const grid = [
      { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms", options: { visibleRows: 999 } },
    ];
    expect(resolveWorldHomeGrid(grid, null, null)[0].options).toEqual({ visibleRows: 50 });
  });
});

describe("compactHomeGridRows", () => {
  it("renumérote les lignes en séquence après la suppression d'un bloc", () => {
    // Ligne 1 libérée (bloc supprimé) : les suivantes remontent au lieu de
    // laisser une ligne fantôme au rendu.
    const items: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "a" },
      { id: "b", type: "markdown", x: 0, y: 2, w: 12, content: "b" },
      { id: "c", type: "markdown", x: 0, y: 4, w: 12, content: "c" },
    ];
    expect(compactHomeGridRows(items).map((i) => i.y)).toEqual([0, 1, 2]);
  });

  it("garde ensemble les blocs qui partagent une ligne", () => {
    const items: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 3, w: 6, content: "a" },
      { id: "b", type: "markdown", x: 6, y: 3, w: 6, content: "b" },
      { id: "c", type: "markdown", x: 0, y: 7, w: 12, content: "c" },
    ];
    expect(compactHomeGridRows(items).map((i) => i.y)).toEqual([0, 0, 1]);
  });

  it("ne touche à rien quand les lignes sont déjà consécutives", () => {
    const items: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "a" },
      { id: "b", type: "markdown", x: 0, y: 1, w: 12, content: "b" },
    ];
    expect(compactHomeGridRows(items)).toEqual(items);
  });

  it("est appliqué à la lecture — une grille trouée en base se répare à l'affichage", () => {
    const grid = [
      { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" },
      { id: "b", type: "widget", x: 0, y: 4, w: 12, widgetId: "stats" },
    ];
    expect(resolveWorldHomeGrid(grid, null, null).map((i) => i.y)).toEqual([0, 1]);
  });
});

describe("findRightNeighbor", () => {
  const left: WorldHomeGridItem = { id: "l", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" };
  const right: WorldHomeGridItem = { id: "r", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" };

  it("trouve le bloc collé au bord droit, sur la même ligne", () => {
    expect(findRightNeighbor([left, right], left)).toEqual(right);
  });

  it("ne retourne rien pour le bloc de droite (rien après lui)", () => {
    expect(findRightNeighbor([left, right], right)).toBeNull();
  });

  it("ignore un bloc d'une autre ligne, même aligné en x", () => {
    const below = { ...right, id: "b", y: 1 };
    expect(findRightNeighbor([left, below], left)).toBeNull();
  });

  it("ignore un bloc séparé par un espace vide", () => {
    const gapped = { ...right, id: "g", x: 8 };
    expect(findRightNeighbor([left, gapped], left)).toBeNull();
  });
});
