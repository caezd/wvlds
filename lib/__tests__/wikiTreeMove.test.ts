import { describe, it, expect } from "vitest";
import {
  deplacementsAuClavier,
  estDansLeSousArbre,
  idZoneApres,
  pageDeZoneApres,
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

/** Hauteur d'une ligne de l'arbre, en pixels. */
const LIGNE = 28;

describe("zoneVisee", () => {
  it("réserve les bords d'un dossier au passage devant ou derrière", () => {
    // Le geste qui manquait : poser une page juste au-dessus ou au-dessous
    // d'un dossier sans qu'elle y entre.
    expect(zoneVisee(3, LIGNE, true)).toBe("avant");
    expect(zoneVisee(25, LIGNE, true)).toBe("apres");
  });

  it("garde le milieu d'un dossier pour y entrer", () => {
    expect(zoneVisee(9, LIGNE, true)).toBe("dans");
    expect(zoneVisee(14, LIGNE, true)).toBe("dans");
    expect(zoneVisee(19, LIGNE, true)).toBe("dans");
  });

  it("garde ses bandes à huit pixels, si haute que soit la boîte", () => {
    // La boîte d'un dossier déplié contient tout son contenu. Une bande en
    // fraction de hauteur y tombait vingt lignes plus bas que l'intitulé : le
    // dossier n'était plus atteignable que par ses enfants.
    const DEPLIE = 400;
    expect(zoneVisee(4, DEPLIE, true)).toBe("avant");
    expect(zoneVisee(20, DEPLIE, true)).toBe("dans");
    expect(zoneVisee(100, DEPLIE, true)).toBe("dans");
  });

  it("coupe une page en deux — elle n'accueille rien", () => {
    expect(zoneVisee(13, LIGNE, false)).toBe("avant");
    expect(zoneVisee(15, LIGNE, false)).toBe("apres");
  });

  it("tient les débordements : le pointeur sort de la boîte visée", () => {
    expect(zoneVisee(-20, LIGNE, true)).toBe("avant");
    expect(zoneVisee(60, LIGNE, true)).toBe("apres");
  });
});

describe("la bande « après un dossier »", () => {
  it("se reconnaît à son identifiant, et rend le dossier visé", () => {
    expect(pageDeZoneApres(idZoneApres("Lieux"))).toBe("Lieux");
  });

  it("ne se confond pas avec l'identifiant d'une page", () => {
    expect(pageDeZoneApres("Lieux")).toBeNull();
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

describe("deplacementsAuClavier", () => {
  // Le glisser-déposer était le seul chemin vers l'ordre des pages, et il
  // demande un pointeur : au clavier, l'arbre était figé. Ces commandes
  // couvrent les mêmes déplacements, un cran à la fois.

  it("propose de descendre la première page, pas de monter", () => {
    expect(deplacementsAuClavier(WIKI, "Accueil")).toEqual({
      descendre: { cibleId: "Lieux", zone: "apres" },
    });
  });

  it("propose de monter la dernière, pas de descendre", () => {
    expect(deplacementsAuClavier(WIKI, "Annexe")).toEqual({
      monter: { cibleId: "Lieux", zone: "avant" },
      entrer: { cibleId: "Lieux", zone: "dans" },
    });
  });

  it("propose d'entrer dans le dossier qu'on a juste au-dessus", () => {
    // « Annexe » suit « Lieux » : c'est ce dossier-là qu'elle peut rejoindre.
    expect(deplacementsAuClavier(WIKI, "Annexe").entrer).toEqual({
      cibleId: "Lieux",
      zone: "dans",
    });
  });

  it("n'entre pas dans une page, qui n'accueille rien", () => {
    expect(deplacementsAuClavier(WIKI, "Lieux").entrer).toBeUndefined();
  });

  it("propose de sortir à qui est dans un dossier", () => {
    expect(deplacementsAuClavier(WIKI, "Forêt").sortir).toEqual({
      cibleId: "Lieux",
      zone: "apres",
    });
  });

  it("ne propose pas de sortir à qui est déjà à la racine", () => {
    expect(deplacementsAuClavier(WIKI, "Accueil").sortir).toBeUndefined();
  });

  it("ne propose rien d'une page inconnue", () => {
    expect(deplacementsAuClavier(WIKI, "Fantôme")).toEqual({});
  });

  it("rend des cibles que `planifierDeplacement` sait exécuter", () => {
    // Les deux chemins — le geste et le menu — passent par la même règle :
    // ce que la commande annonce doit produire une écriture, pas un refus.
    for (const [nom, vise] of Object.entries(deplacementsAuClavier(WIKI, "Annexe"))) {
      const plan = planifierDeplacement(WIKI, "Annexe", vise.cibleId, vise.zone);
      expect(plan, nom).not.toBeNull();
      expect(plan!.length, nom).toBeGreaterThan(0);
    }
  });
});
