import { describe, it, expect } from "vitest";
import {
  estDansLeSousArbre,
  planifierDeplacement,
  zoneVisee,
  type NoeudArbre,
} from "@/lib/wikiTreeMove";

/** `d:` préfixe un dossier. Le parent est donné, l'ordre suit la déclaration. */
function arbre(...lignes: [string, string | null][]): NoeudArbre[] {
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

describe("zoneVisee", () => {
  it("réserve les bords d'un dossier au passage devant ou derrière", () => {
    // Le geste qui manquait : poser une page juste au-dessus ou au-dessous
    // d'un dossier sans qu'elle y entre.
    expect(zoneVisee(0.1, true)).toBe("avant");
    expect(zoneVisee(0.9, true)).toBe("apres");
  });

  it("garde le milieu d'un dossier pour y entrer", () => {
    expect(zoneVisee(0.3, true)).toBe("dans");
    expect(zoneVisee(0.5, true)).toBe("dans");
    expect(zoneVisee(0.7, true)).toBe("dans");
  });

  it("coupe une page en deux — elle n'accueille rien", () => {
    expect(zoneVisee(0.49, false)).toBe("avant");
    expect(zoneVisee(0.51, false)).toBe("apres");
  });

  it("tient les débordements : la page glissée dépasse la ligne visée", () => {
    expect(zoneVisee(-2, true)).toBe("avant");
    expect(zoneVisee(3, true)).toBe("apres");
  });
});

describe("planifierDeplacement — sortir d'un dossier", () => {
  it("fait remonter une page posée devant une page racine", () => {
    expect(planifierDeplacement(WIKI, "Forêt", "Accueil", "avant")).toEqual([
      { id: "Forêt", parent_id: null, sort_index: 0 },
      { id: "Accueil", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
      { id: "Annexe", parent_id: null, sort_index: 3 },
    ]);
  });

  it("la fait sortir par le bord d'un dossier, sans y entrer", () => {
    // Posée sur le quart haut de « Lieux » : elle passe DEVANT le dossier.
    expect(planifierDeplacement(WIKI, "Forêt", "Lieux", "avant")).toEqual([
      { id: "Forêt", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
      { id: "Annexe", parent_id: null, sort_index: 3 },
    ]);
  });

  it("ou par le bord bas, derrière lui", () => {
    const plan = planifierDeplacement(WIKI, "Forêt", "Lieux", "apres")!;
    expect(plan.find(e => e.id === "Forêt")).toEqual({
      id: "Forêt", parent_id: null, sort_index: 2,
    });
  });
});

describe("planifierDeplacement — entrer dans un dossier", () => {
  it("dépose en dernier dans le dossier visé", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Lieux", "dans")).toEqual([
      { id: "Accueil", parent_id: "Lieux", sort_index: 2 },
    ]);
  });

  it("ne fait rien quand la page y est déjà", () => {
    expect(planifierDeplacement(WIKI, "Forêt", "Lieux", "dans")).toBeNull();
  });

  it("refuse d'entrer dans une page", () => {
    // La zone « dans » ne se produit pas sur une page, mais rien ne doit
    // dépendre de ce que l'appelant sait le prévenir.
    expect(planifierDeplacement(WIKI, "Accueil", "Annexe", "dans")).toBeNull();
  });
});

describe("planifierDeplacement — réordonner entre pairs", () => {
  it("pose une page derrière une autre de sa liste", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Annexe", "apres")).toEqual([
      { id: "Lieux", parent_id: null, sort_index: 0 },
      { id: "Annexe", parent_id: null, sort_index: 1 },
      { id: "Accueil", parent_id: null, sort_index: 2 },
    ]);
  });

  it("ou devant", () => {
    expect(planifierDeplacement(WIKI, "Annexe", "Accueil", "avant")).toEqual([
      { id: "Annexe", parent_id: null, sort_index: 0 },
      { id: "Accueil", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
    ]);
  });

  it("réordonne à l'intérieur d'un dossier", () => {
    expect(planifierDeplacement(WIKI, "Ville", "Forêt", "avant")).toEqual([
      { id: "Ville", parent_id: "Lieux", sort_index: 0 },
      { id: "Forêt", parent_id: "Lieux", sort_index: 1 },
    ]);
  });

  it("n'écrit rien quand la page est déjà à sa place", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Lieux", "avant")).toEqual([]);
  });
});

describe("planifierDeplacement — gestes sans effet", () => {
  it("ignore un dépôt sur soi-même", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Accueil", "avant")).toBeNull();
  });

  it("ignore une page inconnue", () => {
    expect(planifierDeplacement(WIKI, "Fantôme", "Accueil", "avant")).toBeNull();
  });

  it("refuse de mettre un dossier dans sa propre descendance", () => {
    // Sans cette garde, « Lieux » deviendrait l'enfant de sa propre fille :
    // plus aucun chemin depuis la racine n'y mènerait, et le sous-arbre entier
    // disparaîtrait de l'écran sans être supprimé.
    expect(planifierDeplacement(WIKI, "Lieux", "Forêt", "avant")).toBeNull();
    expect(planifierDeplacement(WIKI, "Lieux", "Forêt", "apres")).toBeNull();
  });

  it("refuse aussi d'entrer dans un dossier de sa descendance", () => {
    const profond = arbre(
      ["d:Racine", null],
      ["d:Milieu", "Racine"],
      ["Feuille", "Milieu"],
    );
    expect(planifierDeplacement(profond, "Racine", "Milieu", "dans")).toBeNull();
  });
});

describe("estDansLeSousArbre", () => {
  it("reconnaît un descendant, direct ou lointain", () => {
    expect(estDansLeSousArbre(WIKI, "Lieux", "Forêt")).toBe(true);
    expect(estDansLeSousArbre(WIKI, "Lieux", "Lieux")).toBe(true);
    expect(estDansLeSousArbre(WIKI, "Lieux", "Accueil")).toBe(false);
    expect(estDansLeSousArbre(WIKI, "Lieux", null)).toBe(false);
  });

  it("s'arrête devant une boucle de parenté", () => {
    // Un arbre incohérent ne doit pas faire tourner la recherche sans fin.
    const boucle: NoeudArbre[] = [
      { id: "a", parent_id: "b", is_folder: true, sort_index: 0 },
      { id: "b", parent_id: "a", is_folder: true, sort_index: 0 },
    ];
    expect(estDansLeSousArbre(boucle, "z", "a")).toBe(false);
  });
});
