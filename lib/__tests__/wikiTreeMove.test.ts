import { describe, it, expect } from "vitest";
import {
  estDansLeSousArbre,
  indicateurDInsertion,
  planifierDeplacement,
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

describe("planifierDeplacement — sortir d'un dossier", () => {
  it("fait remonter une page lâchée sur une page racine", () => {
    // Le geste qui manquait : aucun moyen de ressortir une page d'un dossier.
    expect(planifierDeplacement(WIKI, "Forêt", "Accueil")).toEqual([
      { id: "Forêt", parent_id: null, sort_index: 0 },
      { id: "Accueil", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
      { id: "Annexe", parent_id: null, sort_index: 3 },
    ]);
  });

  it("la place à l'endroit visé, pas à la fin", () => {
    const plan = planifierDeplacement(WIKI, "Ville", "Annexe")!;
    expect(plan.find(e => e.id === "Ville")).toEqual({
      id: "Ville", parent_id: null, sort_index: 2,
    });
  });
});

describe("planifierDeplacement — entrer dans un dossier", () => {
  it("dépose en dernier dans le dossier visé", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Lieux")).toEqual([
      { id: "Accueil", parent_id: "Lieux", sort_index: 2 },
    ]);
  });

  it("ne fait rien quand la page y est déjà", () => {
    // Lâcher « Forêt » sur son propre dossier n'a rien à changer.
    expect(planifierDeplacement(WIKI, "Forêt", "Lieux")).toEqual([
      { id: "Forêt", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
      { id: "Annexe", parent_id: null, sort_index: 3 },
    ]);
  });
});

describe("planifierDeplacement — réordonner entre pairs", () => {
  it("descend une page dans sa propre liste", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Annexe")).toEqual([
      { id: "Lieux", parent_id: null, sort_index: 0 },
      { id: "Annexe", parent_id: null, sort_index: 1 },
      { id: "Accueil", parent_id: null, sort_index: 2 },
    ]);
  });

  it("remonte une page dans sa propre liste", () => {
    expect(planifierDeplacement(WIKI, "Annexe", "Accueil")).toEqual([
      { id: "Annexe", parent_id: null, sort_index: 0 },
      { id: "Accueil", parent_id: null, sort_index: 1 },
      { id: "Lieux", parent_id: null, sort_index: 2 },
    ]);
  });

  it("réordonne à l'intérieur d'un dossier", () => {
    expect(planifierDeplacement(WIKI, "Ville", "Forêt")).toEqual([
      { id: "Ville", parent_id: "Lieux", sort_index: 0 },
      { id: "Forêt", parent_id: "Lieux", sort_index: 1 },
    ]);
  });
});

describe("planifierDeplacement — gestes sans effet", () => {
  it("ignore un dépôt sur soi-même", () => {
    expect(planifierDeplacement(WIKI, "Accueil", "Accueil")).toBeNull();
  });

  it("ignore une page inconnue", () => {
    expect(planifierDeplacement(WIKI, "Fantôme", "Accueil")).toBeNull();
  });

  it("refuse de mettre un dossier dans sa propre descendance", () => {
    // Sans cette garde, « Lieux » deviendrait l'enfant de sa propre fille :
    // plus aucun chemin depuis la racine n'y mènerait, et le sous-arbre entier
    // disparaîtrait de l'écran sans être supprimé.
    expect(planifierDeplacement(WIKI, "Lieux", "Forêt")).toBeNull();
  });

  it("refuse aussi le dépôt sur un dossier de sa descendance", () => {
    const profond = arbre(
      ["d:Racine", null],
      ["d:Milieu", "Racine"],
      ["Feuille", "Milieu"],
    );
    expect(planifierDeplacement(profond, "Racine", "Milieu")).toBeNull();
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

describe("indicateurDInsertion", () => {
  it("annonce le trait au-dessus quand la page remonte", () => {
    expect(indicateurDInsertion(WIKI, "Annexe", "Accueil")).toEqual({
      cibleId: "Accueil", cote: "avant",
    });
  });

  it("l'annonce au-dessous quand elle descend dans sa propre liste", () => {
    // La page occupera la place visée APRÈS son retrait : le trait doit se
    // poser sous la cible, sans quoi il montrerait un cran trop haut.
    expect(indicateurDInsertion(WIKI, "Accueil", "Annexe")).toEqual({
      cibleId: "Annexe", cote: "apres",
    });
  });

  it("annonce au-dessus quand la page vient d'ailleurs", () => {
    expect(indicateurDInsertion(WIKI, "Forêt", "Annexe")).toEqual({
      cibleId: "Annexe", cote: "avant",
    });
  });

  it("n'annonce rien sur un dossier — le cadre s'en charge", () => {
    expect(indicateurDInsertion(WIKI, "Accueil", "Lieux")).toBeNull();
  });

  it("n'annonce rien pour un geste que le déplacement refuserait", () => {
    expect(indicateurDInsertion(WIKI, "Lieux", "Forêt")).toBeNull();
  });

  it("annonce exactement ce que l'écriture fera", () => {
    // L'invariant qui justifie de partager le calcul : un trait qui montrerait
    // autre chose que le résultat serait pire que pas de trait du tout.
    const couples: [string, string][] = [
      ["Accueil", "Annexe"], ["Annexe", "Accueil"],
      ["Forêt", "Accueil"], ["Ville", "Annexe"], ["Ville", "Forêt"],
    ];
    for (const [actif, cible] of couples) {
      const trait = indicateurDInsertion(WIKI, actif, cible)!;
      const ecritures = planifierDeplacement(WIKI, actif, cible)!;

      const parentCible = WIKI.find(p => p.id === cible)!.parent_id;
      const apres = WIKI
        .map(p => {
          const e = ecritures.find(e => e.id === p.id);
          return e ? { ...p, parent_id: e.parent_id, sort_index: e.sort_index } : p;
        })
        .filter(p => p.parent_id === parentCible)
        .sort((a, b) => a.sort_index - b.sort_index)
        .map(p => p.id);

      const rangDeplace = apres.indexOf(actif);
      const rangCible = apres.indexOf(cible);
      expect(trait.cote === "avant" ? rangDeplace + 1 : rangDeplace - 1).toBe(rangCible);
    }
  });
});
