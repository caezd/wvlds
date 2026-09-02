import { describe, it, expect } from "vitest";
import {
  descendantIds,
  keyboardMoves,
  isInSubtree,
  afterZoneId,
  pageOfAfterZone,
  planMove,
  targetZone,
  type TreeNode,
} from "@/lib/wikiTreeMove";

/** `d:` préfixe un dossier. Le parent est donné, l'ordre suit la déclaration. */
function arbre(...lignes: [string, string | null][]): TreeNode[] {
  const compteurs = new Map<string | null, number>();
  return lignes.map(([nom, parent]) => {
    const rang = compteurs.get(parent) ?? 0;
    compteurs.set(parent, rang + 1);
    return {
      id: nom.replace(/^d:/, ""),
      parent_id: parent,
      is_folder: nom.startsWith("d:"),
      sort_index: rang,
    };
  });
}

/**
 * Wiki de référence :
 *   Accueil
 *   Lieux (dossier)
 *     ├ Forêt
 *     └ Ville
 *   Annexe
 */
const WIKI = arbre(
  ["Accueil", null],
  ["d:Lieux", null],
  ["Annexe", null],
  ["Forêt", "Lieux"],
  ["Ville", "Lieux"],
);

/** Hauteur d'une ligne de l'arbre, en pixels. */
const LIGNE = 28;

describe("targetZone", () => {
  it("réserve les bords d'un dossier au passage devant ou derrière", () => {
    // Le geste qui manquait : poser une page juste au-dessus ou au-dessous
    // d'un dossier sans qu'elle y entre.
    expect(targetZone(3, LIGNE, true)).toBe("before");
    expect(targetZone(25, LIGNE, true)).toBe("after");
  });

  it("garde le milieu d'un dossier pour y entrer", () => {
    expect(targetZone(9, LIGNE, true)).toBe("inside");
    expect(targetZone(14, LIGNE, true)).toBe("inside");
    expect(targetZone(19, LIGNE, true)).toBe("inside");
  });

  it("garde ses bandes à huit pixels, si haute que soit la boîte", () => {
    // La boîte d'un dossier déplié contient tout son contenu. Une bande en
    // fraction de hauteur y tombait vingt lignes plus bas que l'intitulé : le
    // dossier n'était plus atteignable que par ses enfants.
    const DEPLIE = 400;
    expect(targetZone(4, DEPLIE, true)).toBe("before");
    expect(targetZone(20, DEPLIE, true)).toBe("inside");
    expect(targetZone(100, DEPLIE, true)).toBe("inside");
  });

  it("coupe une page en deux — elle n'accueille rien", () => {
    expect(targetZone(13, LIGNE, false)).toBe("before");
    expect(targetZone(15, LIGNE, false)).toBe("after");
  });

  it("tient les débordements : le pointeur sort de la boîte visée", () => {
    expect(targetZone(-20, LIGNE, true)).toBe("before");
    expect(targetZone(60, LIGNE, true)).toBe("after");
  });
});

describe("la bande « après un dossier »", () => {
  it("se reconnaît à son identifiant, et rend le dossier visé", () => {
    expect(pageOfAfterZone(afterZoneId("Lieux"))).toBe("Lieux");
  });

  it("ne se confond pas avec l'identifiant d'une page", () => {
    expect(pageOfAfterZone("Lieux")).toBeNull();
  });
});

describe("planMove — sortir d'un dossier", () => {
  it("fait remonter une page posée devant une page racine", () => {
    expect(planMove(WIKI, "Forêt", "Accueil", "before")).toEqual([
      { id: "Forêt", parent_id: null, sort_index: 0 },
      { id: "Accueil", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
      { id: "Annexe", parent_id: null, sort_index: 3 },
    ]);
  });

  it("la fait sortir par le bord d'un dossier, sans y entrer", () => {
    // Posée sur le quart haut de « Lieux » : elle passe DEVANT le dossier.
    expect(planMove(WIKI, "Forêt", "Lieux", "before")).toEqual([
      { id: "Forêt", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
      { id: "Annexe", parent_id: null, sort_index: 3 },
    ]);
  });

  it("ou par le bord bas, derrière lui", () => {
    const plan = planMove(WIKI, "Forêt", "Lieux", "after")!;
    expect(plan.find(e => e.id === "Forêt")).toEqual({
      id: "Forêt", parent_id: null, sort_index: 2,
    });
  });
});

describe("planMove — entrer dans un dossier", () => {
  it("dépose en dernier dans le dossier visé", () => {
    expect(planMove(WIKI, "Accueil", "Lieux", "inside")).toEqual([
      { id: "Accueil", parent_id: "Lieux", sort_index: 2 },
    ]);
  });

  it("ne fait rien quand la page y est déjà", () => {
    expect(planMove(WIKI, "Forêt", "Lieux", "inside")).toBeNull();
  });

  it("refuse d'entrer dans une page", () => {
    // La zone « dans » ne se produit pas sur une page, mais rien ne doit
    // dépendre de ce que l'appelant sait le prévenir.
    expect(planMove(WIKI, "Accueil", "Annexe", "inside")).toBeNull();
  });
});

describe("planMove — réordonner entre pairs", () => {
  it("pose une page derrière une autre de sa liste", () => {
    expect(planMove(WIKI, "Accueil", "Annexe", "after")).toEqual([
      { id: "Lieux", parent_id: null, sort_index: 0 },
      { id: "Annexe", parent_id: null, sort_index: 1 },
      { id: "Accueil", parent_id: null, sort_index: 2 },
    ]);
  });

  it("ou devant", () => {
    expect(planMove(WIKI, "Annexe", "Accueil", "before")).toEqual([
      { id: "Annexe", parent_id: null, sort_index: 0 },
      { id: "Accueil", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
    ]);
  });

  it("réordonne à l'intérieur d'un dossier", () => {
    expect(planMove(WIKI, "Ville", "Forêt", "before")).toEqual([
      { id: "Ville", parent_id: "Lieux", sort_index: 0 },
      { id: "Forêt", parent_id: "Lieux", sort_index: 1 },
    ]);
  });

  it("n'écrit rien quand la page est déjà à sa place", () => {
    expect(planMove(WIKI, "Accueil", "Lieux", "before")).toEqual([]);
  });
});

describe("planMove — gestes sans effet", () => {
  it("ignore un dépôt sur soi-même", () => {
    expect(planMove(WIKI, "Accueil", "Accueil", "before")).toBeNull();
  });

  it("ignore une page inconnue", () => {
    expect(planMove(WIKI, "Fantôme", "Accueil", "before")).toBeNull();
  });

  it("refuse de mettre un dossier dans sa propre descendance", () => {
    // Sans cette garde, « Lieux » deviendrait l'enfant de sa propre fille :
    // plus aucun chemin depuis la racine n'y mènerait, et le sous-arbre entier
    // disparaîtrait de l'écran sans être supprimé.
    expect(planMove(WIKI, "Lieux", "Forêt", "before")).toBeNull();
    expect(planMove(WIKI, "Lieux", "Forêt", "after")).toBeNull();
  });

  it("refuse aussi d'entrer dans un dossier de sa descendance", () => {
    const profond = arbre(
      ["d:Racine", null],
      ["d:Milieu", "Racine"],
      ["Feuille", "Milieu"],
    );
    expect(planMove(profond, "Racine", "Milieu", "inside")).toBeNull();
  });
});

describe("isInSubtree", () => {
  it("reconnaît un descendant, direct ou lointain", () => {
    expect(isInSubtree(WIKI, "Lieux", "Forêt")).toBe(true);
    expect(isInSubtree(WIKI, "Lieux", "Lieux")).toBe(true);
    expect(isInSubtree(WIKI, "Lieux", "Accueil")).toBe(false);
    expect(isInSubtree(WIKI, "Lieux", null)).toBe(false);
  });

  it("s'arrête devant une boucle de parenté", () => {
    // Un arbre incohérent ne doit pas faire tourner la recherche sans fin.
    const boucle: TreeNode[] = [
      { id: "a", parent_id: "b", is_folder: true, sort_index: 0 },
      { id: "b", parent_id: "a", is_folder: true, sort_index: 0 },
    ];
    expect(isInSubtree(boucle, "z", "a")).toBe(false);
  });
});

describe("keyboardMoves", () => {
  // Le glisser-déposer était le seul chemin vers l'ordre des pages, et il
  // demande un pointeur : au clavier, l'arbre était figé. Ces commandes
  // couvrent les mêmes déplacements, un cran à la fois.

  it("propose de descendre la première page, pas de monter", () => {
    expect(keyboardMoves(WIKI, "Accueil")).toEqual({
      descendre: { targetId: "Lieux", zone: "after" },
    });
  });

  it("propose de monter la dernière, pas de descendre", () => {
    expect(keyboardMoves(WIKI, "Annexe")).toEqual({
      monter: { targetId: "Lieux", zone: "before" },
      entrer: { targetId: "Lieux", zone: "inside" },
    });
  });

  it("propose d'entrer dans le dossier qu'on a juste au-dessus", () => {
    // « Annexe » suit « Lieux » : c'est ce dossier-là qu'elle peut rejoindre.
    expect(keyboardMoves(WIKI, "Annexe").entrer).toEqual({
      targetId: "Lieux",
      zone: "inside",
    });
  });

  it("n'entre pas dans une page, qui n'accueille rien", () => {
    expect(keyboardMoves(WIKI, "Lieux").entrer).toBeUndefined();
  });

  it("propose de sortir à qui est dans un dossier", () => {
    expect(keyboardMoves(WIKI, "Forêt").sortir).toEqual({
      targetId: "Lieux",
      zone: "after",
    });
  });

  it("ne propose pas de sortir à qui est déjà à la racine", () => {
    expect(keyboardMoves(WIKI, "Accueil").sortir).toBeUndefined();
  });

  it("ne propose rien d'une page inconnue", () => {
    expect(keyboardMoves(WIKI, "Fantôme")).toEqual({});
  });

  it("rend des cibles que `planMove` sait exécuter", () => {
    // Les deux chemins — le geste et le menu — passent par la même règle :
    // ce que la commande annonce doit produire une écriture, pas un refus.
    for (const [nom, vise] of Object.entries(keyboardMoves(WIKI, "Annexe"))) {
      const plan = planMove(WIKI, "Annexe", vise.targetId, vise.zone);
      expect(plan, nom).not.toBeNull();
      expect(plan!.length, nom).toBeGreaterThan(0);
    }
  });
});

describe("descendantIds", () => {
  it("rend la page d'abord, puis toute sa descendance", () => {
    // Supprimer un dossier emporte ce qu'il contient ; le restaurer doit
    // ramener la même chose.
    expect(descendantIds(WIKI, "Lieux")).toEqual(["Lieux", "Forêt", "Ville"]);
  });

  it("ne rend qu'elle-même pour une page sans enfant", () => {
    expect(descendantIds(WIKI, "Accueil")).toEqual(["Accueil"]);
  });

  it("s'arrête devant une boucle de parenté", () => {
    const loop: TreeNode[] = [
      { id: "a", parent_id: "b", is_folder: true, sort_index: 0 },
      { id: "b", parent_id: "a", is_folder: true, sort_index: 0 },
    ];
    expect(descendantIds(loop, "a").length).toBeLessThanOrEqual(3);
  });
});
