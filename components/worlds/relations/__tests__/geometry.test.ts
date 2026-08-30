import { describe, it, expect } from "vitest";

import {
  mid,
  blockH,
  cardTL,
  cardCtr,
  bezierD,
  bezierMidPt,
  splitBezierHalves,
  CW,
  CH,
  CG,
  BP,
  HH,
  NC,
  BLOCK_W,
} from "../geometry";

// ──────────────────────────────────────────────────────────────────────────
// La géométrie du canevas de relations était noyée dans un composant de
// 1 428 lignes, et n'avait aucun test. Ce sont pourtant des fonctions pures :
// des nombres vers des nombres, ou vers un chemin SVG.
//
// Ce qui est vérifié ici, ce n'est pas une apparence — impossible à assurer
// depuis jsdom, qui ne fait aucune mise en page SVG — mais les invariants qui
// la produisent : les cartes ne se chevauchent pas, elles tiennent dans leur
// bloc, et les deux calculs indépendants du milieu d'une flèche s'accordent.
// ──────────────────────────────────────────────────────────────────────────

describe("mid", () => {
  it("retire les tirets, qu'un identifiant SVG n'admet pas", () => {
    expect(mid("68688894-1f2e-4b3c-9d0a-112233445566")).toBe(
      "arr-686888941f2e4b3c9d0a112233445566",
    );
  });

  it("donne des identifiants distincts à des uuid distincts", () => {
    // Deux marqueurs de flèche portant le même id, et toutes les flèches
    // prennent la couleur de la première.
    expect(mid("aaaa-bbbb")).not.toBe(mid("aaab-bbb"));
  });
});

describe("blockH", () => {
  it("garde une rangée même sans aucune carte", () => {
    // Un bloc à zéro carte doit rester saisissable pour être déplacé.
    expect(blockH(0)).toBe(blockH(1));
    expect(blockH(0)).toBeGreaterThan(HH);
  });

  it("ne change pas de hauteur tant que la rangée n'est pas remplie", () => {
    expect(blockH(1)).toBe(blockH(NC));
  });

  it("ajoute une rangée et son écart au-delà de la capacité", () => {
    expect(blockH(NC + 1) - blockH(NC)).toBe(CH + CG);
  });

  it("croît régulièrement, une marche par rangée", () => {
    const hauteurs = [1, 3, 5, 7, 9].map((n) => blockH(n));
    for (let i = 1; i < hauteurs.length; i++) {
      expect(hauteurs[i]).toBeGreaterThan(hauteurs[i - 1]);
    }
  });
});

describe("cardTL", () => {
  it("dispose les cartes sur NC colonnes", () => {
    const a = cardTL(0);
    const b = cardTL(1);
    expect(b.y).toBe(a.y);
    expect(b.x - a.x).toBe(CW + CG);
  });

  it("passe à la rangée suivante une fois les colonnes remplies", () => {
    const premiere = cardTL(0);
    const suivante = cardTL(NC);
    expect(suivante.x).toBe(premiere.x);
    expect(suivante.y - premiere.y).toBe(CH + CG);
  });

  it("ne fait jamais déborder une carte du bloc", () => {
    // La largeur du bloc est calculée à partir des mêmes constantes ; si l'une
    // dérive, une carte sort de son cadre.
    for (let i = 0; i < 12; i++) {
      expect(cardTL(i).x + CW).toBeLessThanOrEqual(BLOCK_W);
    }
  });

  it("laisse l'en-tête libre au-dessus de la première rangée", () => {
    // Sans cela, la première rangée de cartes recouvre la poignée de
    // déplacement du bloc, qui devient inutilisable.
    expect(cardTL(0).y).toBeGreaterThanOrEqual(HH);
    expect(cardTL(0).x).toBeGreaterThanOrEqual(BP);
  });

  it("ne superpose aucune paire de cartes", () => {
    const boites = Array.from({ length: 9 }, (_, i) => cardTL(i));
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        const chevauche =
          Math.abs(boites[i].x - boites[j].x) < CW && Math.abs(boites[i].y - boites[j].y) < CH;
        expect(chevauche, `cartes ${i} et ${j} superposées`).toBe(false);
      }
    }
  });
});

describe("cardCtr", () => {
  it("place le centre au milieu de la carte, décalé de la position du bloc", () => {
    const coin = cardTL(3);
    const centre = cardCtr(100, 200, 3);
    expect(centre.x).toBe(100 + coin.x + CW / 2);
    expect(centre.y).toBe(200 + coin.y + CH / 2);
  });

  it("suit le bloc quand on le déplace", () => {
    const avant = cardCtr(0, 0, 1);
    const apres = cardCtr(50, -30, 1);
    expect(apres.x - avant.x).toBe(50);
    expect(apres.y - avant.y).toBe(-30);
  });
});

describe("bezierD", () => {
  it("produit un chemin SVG cubique complet", () => {
    const d = bezierD(0, 0, 400, 300);
    expect(d).toMatch(/^M [-\d.]+ [-\d.]+ C ([-\d.]+ ){5}[-\d.]+$/);
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it("ne dégénère pas quand les deux cartes se superposent", () => {
    // Deux personnages au même point : la division par une distance nulle
    // produirait NaN et la flèche disparaîtrait sans un mot.
    const d = bezierD(120, 120, 120, 120);
    expect(d).not.toMatch(/NaN/);
  });

  it("part du bord de la carte et non de son centre", () => {
    // Une flèche partant du centre passerait sous l'avatar.
    const [, ax, ay] = /^M ([-\d.]+) ([-\d.]+)/.exec(bezierD(0, 0, 500, 0))!;
    expect(Number(ax)).toBeCloseTo(CW / 2, 5);
    expect(Number(ay)).toBeCloseTo(0, 5);
  });
});

describe("bezierMidPt et splitBezierHalves s'accordent", () => {
  // Deux calculs indépendants du même point : les coefficients de Bernstein à
  // t = 0,5 d'un côté, De Casteljau de l'autre. Ils doivent coïncider — c'est
  // ce point qui porte l'étiquette de la relation, et les deux moitiés de trait
  // colorées séparément en partent.
  //
  // Portée exacte de ce contrôle, mesurée en réintroduisant les défauts : il
  // attrape une dérive des coefficients ou de `edgePoint`. Il ne peut PAS voir
  // un changement de l'amplitude `ofs` des poignées, et ce n'est pas une
  // faiblesse du test — le milieu n'en dépend réellement pas. Les deux cartes
  // ayant la même taille, `edgePoint` rend des normales exactement opposées,
  // et le terme en `ofs` de P(0,5) = 0,5·A + 0,5·B + 0,375·ofs·(nA + nB)
  // s'annule. D'où le contrôle qui suit, qui énonce cette réduction.
  const paires: [number, number, number, number][] = [
    [0, 0, 400, 300],
    [500, 120, 40, 600],
    [-200, -50, 60, 90],
    [10, 10, 10, 400],
    [300, 0, 0, 0],
  ];

  for (const [ax, ay, bx, by] of paires) {
    it(`(${ax},${ay}) → (${bx},${by})`, () => {
      const attendu = bezierMidPt(ax, ay, bx, by);
      const obtenu = splitBezierHalves(ax, ay, bx, by).mid;
      expect(obtenu.x).toBeCloseTo(attendu.x, 9);
      expect(obtenu.y).toBeCloseTo(attendu.y, 9);
    });
  }
});

describe("le milieu tombe à mi-chemin des deux bords", () => {
  // Conséquence du point précédent, et propriété que l'on veut vraiment :
  // l'étiquette d'une relation se pose exactement entre les deux cartes, quelle
  // que soit la courbure du trait. Ce contrôle-ci est sensible à `edgePoint`,
  // donc à la géométrie des bords.
  const paires: [number, number, number, number][] = [
    [0, 0, 400, 300],
    [500, 120, 40, 600],
    [-200, -50, 60, 90],
  ];

  for (const [ax, ay, bx, by] of paires) {
    it(`(${ax},${ay}) → (${bx},${by})`, () => {
      const d = bezierD(ax, ay, bx, by);
      const [, dx, dy] = /^M ([-\d.]+) ([-\d.]+)/.exec(d)!;
      const [fx, fy] = d.trim().split(" ").slice(-2).map(Number);

      const m = bezierMidPt(ax, ay, bx, by);
      expect(m.x).toBeCloseTo((Number(dx) + fx) / 2, 9);
      expect(m.y).toBeCloseTo((Number(dy) + fy) / 2, 9);
    });
  }
});

describe("splitBezierHalves", () => {
  it("rend deux demi-chemins partant tous deux du milieu", () => {
    const { dMidToA, dMidToB, mid: m } = splitBezierHalves(0, 0, 400, 300);
    const debut = (d: string) => /^M ([-\d.]+) ([-\d.]+)/.exec(d)!.slice(1).map(Number);
    expect(debut(dMidToA)).toEqual([m.x, m.y]);
    expect(debut(dMidToB)).toEqual([m.x, m.y]);
  });

  it("rejoint les mêmes extrémités que le chemin entier", () => {
    // Les deux moitiés servent à colorer une relation différemment de chaque
    // côté : superposées, elles doivent redonner exactement le trait complet.
    const entier = bezierD(0, 0, 400, 300);
    const [, ax, ay] = /^M ([-\d.]+) ([-\d.]+)/.exec(entier)!;
    const finB = entier.trim().split(" ").slice(-2).map(Number);

    const { dMidToA, dMidToB } = splitBezierHalves(0, 0, 400, 300);
    expect(dMidToA.trim().split(" ").slice(-2).map(Number)).toEqual([Number(ax), Number(ay)]);
    expect(dMidToB.trim().split(" ").slice(-2).map(Number)).toEqual(finB);
  });
});
