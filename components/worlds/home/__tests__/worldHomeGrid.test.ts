import { describe, it, expect } from "vitest";
import {
  compactHomeGridRows,
  DEFAULT_HOME_GRID_GAP,
  findLeftNeighbor,
  findRightNeighbor,
  HOME_GRID_COLS,
  HOME_GRID_GAP_PRESETS,
  MAX_BLOCKS_PER_ROW,
  MAX_HOME_GRID_ITEMS,
  moveBlock,
  resizeBlock,
  resolveHomeGridGap,
  resolveWorldHomeGrid,
  rowBoundaries,
  sanitizeBannerContent,
  sanitizeWidgetOptions,
  widgetOptionValue,
  type WorldHomeGridItem,
} from "@/components/worlds/home/worldHomeGrid";

describe("resolveHomeGridGap", () => {
  it("reconnaît chacun des préréglages valides", () => {
    for (const preset of Object.keys(HOME_GRID_GAP_PRESETS)) {
      expect(resolveHomeGridGap(preset)).toBe(preset);
    }
  });

  it("retombe sur la valeur par défaut pour une valeur inconnue ou absente", () => {
    expect(resolveHomeGridGap(null)).toBe(DEFAULT_HOME_GRID_GAP);
    expect(resolveHomeGridGap(undefined)).toBe(DEFAULT_HOME_GRID_GAP);
    expect(resolveHomeGridGap("huge")).toBe(DEFAULT_HOME_GRID_GAP);
    expect(resolveHomeGridGap(42)).toBe(DEFAULT_HOME_GRID_GAP);
  });

  it("les préréglages sont strictement croissants (compact < confortable < spacieux)", () => {
    expect(HOME_GRID_GAP_PRESETS.compact).toBeLessThan(HOME_GRID_GAP_PRESETS.comfortable);
    expect(HOME_GRID_GAP_PRESETS.comfortable).toBeLessThan(HOME_GRID_GAP_PRESETS.spacious);
  });
});

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

  it("rejette l'id 'stats' comme widgetId — devenu une case à cocher, plus un bloc plaçable", () => {
    const grid = [{ id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "stats" }];
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
      { id: "c", type: "widget", x: 0, y: 0, w: 0, widgetId: "members_online" },
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

  it("accepte un bloc html avec du contenu — carte activée par défaut", () => {
    const grid: WorldHomeGridItem[] = [{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual([{ ...grid[0], card: true }]);
  });

  it("accepte un bloc markdown avec du contenu — plein largeur par défaut", () => {
    const grid: WorldHomeGridItem[] = [{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "# Titre" }];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual([{ ...grid[0], card: false }]);
  });

  it("préserve card: false explicite sur un bloc html", () => {
    const grid = [{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", card: false }];
    expect(resolveWorldHomeGrid(grid, null, null)[0].card).toBe(false);
  });

  it("préserve card: true explicite sur un bloc markdown", () => {
    const grid = [{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x", card: true }];
    expect(resolveWorldHomeGrid(grid, null, null)[0].card).toBe(true);
  });

  it("accepte un bloc bannière avec un titre", () => {
    const grid = [{ id: "a", type: "banner", x: 0, y: 0, w: 12, banner: { title: "Bienvenue" } }];
    expect(resolveWorldHomeGrid(grid, null, null)).toEqual([
      { id: "a", type: "banner", x: 0, y: 0, w: 12, banner: { title: "Bienvenue" } },
    ]);
  });

  it("rejette un bloc bannière entièrement vide (ni titre, ni texte, ni image)", () => {
    const grid = [{ id: "a", type: "banner", x: 0, y: 0, w: 12, banner: {} }];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
  });

  it("rejette un bloc bannière qui porte aussi un widgetId", () => {
    const grid = [
      { id: "a", type: "banner", x: 0, y: 0, w: 12, banner: { title: "x" }, widgetId: "chatrooms" },
    ];
    expect(resolveWorldHomeGrid(grid, [], null)).toEqual([]);
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
    const resolved = resolveWorldHomeGrid(grid, ["members_online"], null);
    expect(resolved).toEqual([
      { id: "members_online", type: "widget", x: 0, y: 0, w: HOME_GRID_COLS, widgetId: "members_online" },
    ]);
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
    const resolved = resolveWorldHomeGrid(null, ["chatrooms", "members_online"], null);
    expect(resolved.map((i) => i.widgetId)).toEqual(["chatrooms", "members_online"]);
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
    expect(widgetOptionValue("categories", "visibleRows", { visibleRows: 4 })).toBe(0);
  });

  it("sanitizeWidgetOptions écarte les clés inconnues", () => {
    expect(sanitizeWidgetOptions("chatrooms", { visibleRows: 5, inconnu: 3 })).toEqual({ visibleRows: 5 });
  });

  it("sanitizeWidgetOptions borne les valeurs au registre", () => {
    expect(sanitizeWidgetOptions("wiki_shortcuts", { limit: 999 })).toEqual({ limit: 20 });
  });

  it("timeline_shortcuts a un réglage limit enregistré, avec sa valeur par défaut", () => {
    expect(widgetOptionValue("timeline_shortcuts", "limit", undefined)).toBe(6);
    expect(widgetOptionValue("timeline_shortcuts", "limit", { limit: 999 })).toBe(20);
  });

  it("sanitizeWidgetOptions retourne undefined plutôt qu'un objet vide", () => {
    expect(sanitizeWidgetOptions("chatrooms", { inconnu: 3 })).toBeUndefined();
    expect(sanitizeWidgetOptions("categories", { visibleRows: 4 })).toBeUndefined();
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

describe("sanitizeBannerContent", () => {
  it("rejette un objet sans titre, texte ni image", () => {
    expect(sanitizeBannerContent({})).toBeNull();
    expect(sanitizeBannerContent(null)).toBeNull();
    expect(sanitizeBannerContent({ accent: "#ff0000" })).toBeNull();
  });

  it("accepte un titre seul", () => {
    expect(sanitizeBannerContent({ title: "  Bienvenue  " })).toEqual({ title: "Bienvenue" });
  });

  it("tronque le titre et le texte à leur longueur maximale", () => {
    const result = sanitizeBannerContent({ title: "a".repeat(200), text: "b".repeat(1000) });
    expect(result?.title?.length).toBeLessThanOrEqual(80);
    expect(result?.text?.length).toBeLessThanOrEqual(400);
  });

  it("n'accepte une image que sous forme d'URL absolue http(s) ou de chemin relatif", () => {
    expect(sanitizeBannerContent({ image: "https://example.com/x.webp" })?.image).toBe("https://example.com/x.webp");
    expect(sanitizeBannerContent({ image: "/local/x.webp" })?.image).toBe("/local/x.webp");
    expect(sanitizeBannerContent({ title: "x", image: "javascript:alert(1)" })?.image).toBeUndefined();
  });

  it("n'accepte un accent que sous forme de couleur hexadécimale", () => {
    expect(sanitizeBannerContent({ title: "x", accent: "#3b82f6" })?.accent).toBe("#3b82f6");
    expect(sanitizeBannerContent({ title: "x", accent: "red" })?.accent).toBeUndefined();
  });

  it("align 'center' explicite est conservé, tout le reste retombe sur l'absence (gauche implicite)", () => {
    expect(sanitizeBannerContent({ title: "x", align: "center" })?.align).toBe("center");
    expect(sanitizeBannerContent({ title: "x", align: "left" })?.align).toBeUndefined();
    expect(sanitizeBannerContent({ title: "x", align: "n'importe quoi" })?.align).toBeUndefined();
  });

  it("le bouton n'est conservé que si le libellé ET l'URL sont tous les deux présents", () => {
    expect(sanitizeBannerContent({ title: "x", buttonLabel: "Voir" })?.buttonLabel).toBeUndefined();
    expect(sanitizeBannerContent({ title: "x", buttonUrl: "https://x.test" })?.buttonUrl).toBeUndefined();
    const both = sanitizeBannerContent({ title: "x", buttonLabel: "Voir", buttonUrl: "https://x.test" });
    expect(both).toMatchObject({ buttonLabel: "Voir", buttonUrl: "https://x.test" });
  });

  it("rejette une URL de bouton qui n'est ni http(s) ni un chemin relatif", () => {
    const result = sanitizeBannerContent({ title: "x", buttonLabel: "Voir", buttonUrl: "javascript:alert(1)" });
    expect(result?.buttonLabel).toBeUndefined();
    expect(result?.buttonUrl).toBeUndefined();
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
      { id: "b", type: "widget", x: 0, y: 4, w: 12, widgetId: "members_online" },
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

describe("resizeBlock", () => {
  const pair = (): WorldHomeGridItem[] => [
    { id: "l", type: "markdown", x: 0, y: 0, w: 6, content: "l" },
    { id: "r", type: "markdown", x: 6, y: 0, w: 6, content: "r" },
  ];

  it("élargir par le bord droit rétrécit d'autant le voisin de droite", () => {
    const [l, r] = resizeBlock(pair(), "l", "e", 2);
    expect([l.x, l.w]).toEqual([0, 8]);
    expect([r.x, r.w]).toEqual([8, 4]);
  });

  it("élargir par le bord gauche rétrécit d'autant le voisin de gauche", () => {
    // Le bord DROIT du bloc tiré reste fixe : seule la séparation bouge.
    const [l, r] = resizeBlock(pair(), "r", "w", -2);
    expect([l.x, l.w]).toEqual([0, 4]);
    expect([r.x, r.w]).toEqual([4, 8]);
  });

  it("la paire garde sa largeur totale, quel que soit le bord tiré", () => {
    for (const edge of ["w", "e"] as const) {
      for (const delta of [-5, -1, 3, 9]) {
        const id = edge === "e" ? "l" : "r";
        const total = resizeBlock(pair(), id, edge, delta).reduce((sum, i) => sum + i.w, 0);
        expect(total).toBe(HOME_GRID_COLS);
      }
    }
  });

  it("ne laisse aucun des deux passer sous la largeur minimale", () => {
    expect(resizeBlock(pair(), "l", "e", 99).map((i) => i.w)).toEqual([10, 2]);
    expect(resizeBlock(pair(), "l", "e", -99).map((i) => i.w)).toEqual([2, 10]);
  });

  it("sans voisin, le bloc s'étend jusqu'au bord de la grille", () => {
    const solo: WorldHomeGridItem[] = [{ id: "a", type: "markdown", x: 0, y: 0, w: 6, content: "a" }];
    expect(resizeBlock(solo, "a", "e", 99)[0].w).toBe(HOME_GRID_COLS);
    expect(resizeBlock(solo, "a", "e", -99)[0].w).toBe(2);
  });
});

describe("moveBlock", () => {
  const items = (): WorldHomeGridItem[] => [
    { id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "a" },
    { id: "b", type: "markdown", x: 0, y: 1, w: 12, content: "b" },
  ];

  it("déposer un bloc sur la ligne d'un autre les met côte à côte", () => {
    // C'est le geste qui crée une ligne à deux colonnes : la ligne d'arrivée
    // se redistribue pour faire de la place.
    const moved = moveBlock(items(), "b", 0, 11);
    expect(moved.map((i) => [i.id, i.x, i.y, i.w])).toEqual([
      ["a", 0, 0, 6],
      ["b", 6, 0, 6],
    ]);
  });

  it("insère à gauche ou à droite selon la colonne visée", () => {
    const before = moveBlock(items(), "b", 0, 0);
    expect(before.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("retirer un bloc d'une ligne rend sa place aux autres", () => {
    const shared: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 6, content: "a" },
      { id: "b", type: "markdown", x: 6, y: 0, w: 6, content: "b" },
    ];
    // `b` descend sur une nouvelle ligne : `a` doit reprendre toute la place.
    const moved = moveBlock(shared, "b", 1, 0);
    expect(moved.map((i) => [i.id, i.y, i.w])).toEqual([
      ["a", 0, 12],
      ["b", 1, 12],
    ]);
  });

  it("ne touche pas aux largeurs des lignes non concernées", () => {
    const three: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 4, content: "a" },
      { id: "b", type: "markdown", x: 4, y: 0, w: 8, content: "b" },
      { id: "c", type: "markdown", x: 0, y: 1, w: 12, content: "c" },
      { id: "d", type: "markdown", x: 0, y: 2, w: 12, content: "d" },
    ];
    // `d` rejoint la ligne de `c` : la première ligne (4/8, réglée à la
    // main) doit rester intacte.
    const moved = moveBlock(three, "d", 1, 11);
    const byId = Object.fromEntries(moved.map((i) => [i.id, i]));
    expect([byId.a.w, byId.b.w]).toEqual([4, 8]);
    expect([byId.c.w, byId.d.w]).toEqual([6, 6]);
  });

  it("refuse d'ajouter un bloc à une ligne déjà pleine", () => {
    const full: WorldHomeGridItem[] = [
      ...Array.from({ length: MAX_BLOCKS_PER_ROW }, (_, i) => ({
        id: `f${i}`,
        type: "markdown" as const,
        x: i * 2,
        y: 0,
        w: 2,
        content: "x",
      })),
      { id: "extra", type: "markdown", x: 0, y: 1, w: 12, content: "e" },
    ];
    expect(moveBlock(full, "extra", 0, 0)).toEqual(full);
  });

  it("déposer sous la dernière ligne crée une nouvelle ligne", () => {
    const moved = moveBlock(items(), "a", 5, 0);
    expect(moved.map((i) => [i.id, i.y])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("en mode « nouvelle ligne », s'insère seul au-dessus sans rejoindre la ligne visée", () => {
    // Régression : une ligne à deux colonnes absorbait tout bloc qu'on
    // essayait de faire passer au-dessus d'elle — il n'y avait aucun moyen
    // d'exprimer « place-le sur sa propre ligne ici ».
    const twoCols: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 6, content: "a" },
      { id: "b", type: "markdown", x: 6, y: 0, w: 6, content: "b" },
      { id: "c", type: "markdown", x: 0, y: 1, w: 12, content: "c" },
    ];
    const moved = moveBlock(twoCols, "c", 0, 0, true);
    expect(moved.map((i) => [i.id, i.y, i.w])).toEqual([
      ["c", 0, 12],
      ["a", 1, 6],
      ["b", 1, 6],
    ]);
  });

  it("en mode « nouvelle ligne », la ligne quittée se repartage la largeur", () => {
    const twoCols: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 6, content: "a" },
      { id: "b", type: "markdown", x: 6, y: 0, w: 6, content: "b" },
    ];
    // `a` descend seul en dessous : `b` doit reprendre toute la ligne.
    const moved = moveBlock(twoCols, "a", 1, 0, true);
    expect(moved.map((i) => [i.id, i.y, i.w])).toEqual([
      ["b", 0, 12],
      ["a", 1, 12],
    ]);
  });
});

describe("rowBoundaries", () => {
  it("retourne une frontière par paire de colonnes voisines", () => {
    const items: WorldHomeGridItem[] = [
      { id: "a", type: "markdown", x: 0, y: 0, w: 4, content: "a" },
      { id: "b", type: "markdown", x: 4, y: 0, w: 4, content: "b" },
      { id: "c", type: "markdown", x: 8, y: 0, w: 4, content: "c" },
    ];
    expect(rowBoundaries(items).map(({ left, right }) => [left.id, right.id])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
  });

  it("ignore les bords extérieurs et les lignes à un seul bloc", () => {
    const items: WorldHomeGridItem[] = [
      { id: "solo", type: "markdown", x: 0, y: 0, w: 12, content: "s" },
      { id: "x", type: "markdown", x: 0, y: 1, w: 6, content: "x" },
      { id: "y", type: "markdown", x: 6, y: 1, w: 6, content: "y" },
    ];
    expect(rowBoundaries(items).map(({ left, right }) => [left.id, right.id])).toEqual([["x", "y"]]);
  });
});

describe("findLeftNeighbor", () => {
  const left: WorldHomeGridItem = { id: "l", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" };
  const right: WorldHomeGridItem = { id: "r", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" };

  it("trouve le bloc collé au bord gauche, sur la même ligne", () => {
    expect(findLeftNeighbor([left, right], right)).toEqual(left);
  });

  it("ne retourne rien pour le bloc de gauche (rien avant lui)", () => {
    expect(findLeftNeighbor([left, right], left)).toBeNull();
  });

  it("ignore un bloc d'une autre ligne, même adjacent en x", () => {
    const above = { ...left, id: "a", y: 1 };
    expect(findLeftNeighbor([above, right], right)).toBeNull();
  });

  it("ignore un bloc séparé par un espace vide", () => {
    const gapped = { ...left, id: "g", w: 4 };
    expect(findLeftNeighbor([gapped, right], right)).toBeNull();
  });
});
