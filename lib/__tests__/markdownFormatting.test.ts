import { describe, it, expect } from "vitest";
import {
  appliquerFormat,
  basculerEnveloppe,
  basculerListeNumerotee,
  basculerPrefixe,
  insererLien,
  libelleRaccourci,
  raccourciDe,
  type ChampTexte,
} from "@/lib/markdownFormatting";

/** `«…»` marque la sélection : plus lisible qu'un couple d'indices à compter. */
function champ(marque: string): ChampTexte {
  const start = marque.indexOf("«");
  const sansDebut = marque.replace("«", "");
  const end = sansDebut.indexOf("»");
  return { value: sansDebut.replace("»", ""), start, end };
}

function rendu(c: ChampTexte): string {
  return `${c.value.slice(0, c.start)}«${c.value.slice(c.start, c.end)}»${c.value.slice(c.end)}`;
}

const touche = (o: Partial<Parameters<typeof raccourciDe>[0]>) => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...o,
});

describe("basculerEnveloppe", () => {
  it("encadre la sélection", () => {
    expect(rendu(basculerEnveloppe(champ("un «mot» ici"), "**"))).toBe("un **«mot»** ici");
  });

  it("laisse dehors l'espace qu'un double-clic emporte", () => {
    // Double-cliquer un mot sélectionne l'espace qui le suit, dans tous les
    // navigateurs. `**mot **` n'est pas du gras — CommonMark refuse un
    // délimiteur fermant précédé d'une espace — et les étoiles restaient
    // affichées telles quelles : le geste le plus courant ne donnait rien.
    expect(rendu(basculerEnveloppe(champ("un «mot »ici"), "**"))).toBe("un **«mot»** ici");
  });

  it("laisse dehors l'espace de tête aussi", () => {
    expect(rendu(basculerEnveloppe(champ("un« mot» ici"), "**"))).toBe("un **«mot»** ici");
  });

  it("dénude un passage sélectionné avec ses marqueurs et une espace", () => {
    // Sans le rétrécissement, l'espace finale empêchait de reconnaître les
    // marqueurs embrassés : on en ajoutait une seconde paire au lieu de les
    // retirer.
    expect(rendu(basculerEnveloppe(champ("un «**mot** »ici"), "**"))).toBe("un «mot» ici");
  });

  it("ne réduit pas à rien une sélection toute blanche", () => {
    expect(rendu(basculerEnveloppe(champ("un« »mot"), "**"))).toBe("un**« »**mot");
  });

  it("retire les marqueurs déjà posés autour", () => {
    expect(rendu(basculerEnveloppe(champ("un **«mot»** ici"), "**"))).toBe("un «mot» ici");
  });

  it("retire les marqueurs quand la sélection les englobe", () => {
    // Ce que donne un double-clic élargi, ou une sélection à la souris.
    expect(rendu(basculerEnveloppe(champ("un «**mot**» ici"), "**"))).toBe("un «mot» ici");
  });

  it("pose le curseur entre les marqueurs sur une sélection vide", () => {
    expect(rendu(basculerEnveloppe(champ("fin «»"), "**"))).toBe("fin **«»**");
  });

  it("ajoute l'italique à du gras au lieu de le défaire", () => {
    // Sans garde, le `*` extérieur du `**` passerait pour le marqueur italique
    // et le gras se dissoudrait en italique.
    expect(rendu(basculerEnveloppe(champ("**«mot»**"), "*"))).toBe("***«mot»***");
  });

  it("retire l'italique seul quand il est bien seul", () => {
    expect(rendu(basculerEnveloppe(champ("*«mot»*"), "*"))).toBe("«mot»");
  });
});

describe("basculerPrefixe", () => {
  it("préfixe la ligne touchée", () => {
    expect(rendu(basculerPrefixe(champ("Un «titre»"), "## "))).toBe("## Un «titre»");
  });

  it("retire le préfixe quand toutes les lignes l'ont", () => {
    expect(rendu(basculerPrefixe(champ("- «a»\n- b"), "- "))).toBe("«a»\n- b");
  });

  it("remplace un préfixe concurrent au lieu de l'empiler", () => {
    expect(rendu(basculerPrefixe(champ("# «Titre»"), "## "))).toBe("## «Titre»");
    expect(rendu(basculerPrefixe(champ("- «a»"), "> "))).toBe("> «a»");
  });

  it("garde la ligne entière sélectionnée, marqueur compris", () => {
    // Sélection partie du début de ligne : le `- ` posé devant appartient à la
    // ligne qu'on avait surlignée, la sélection ne doit pas le laisser dehors.
    expect(rendu(basculerPrefixe(champ("«a\nb\nc»"), "- "))).toBe("«- a\n- b\n- c»");
  });

  it("ignore la ligne suivante quand la sélection s'arrête au retour", () => {
    // Sélectionner une ligne entière au clavier embarque son `\n` : la ligne
    // d'après n'est pas surlignée, elle ne doit pas être préfixée.
    expect(rendu(basculerPrefixe(champ("«a\n»b"), "- "))).toBe("«- a\n»b");
  });
});

describe("basculerListeNumerotee", () => {
  it("numérote dans l'ordre", () => {
    expect(rendu(basculerListeNumerotee(champ("«a\nb\nc»")))).toBe("«1. a\n2. b\n3. c»");
  });

  it("convertit une liste à puces sans empiler les marqueurs", () => {
    expect(rendu(basculerListeNumerotee(champ("«- a\n- b»")))).toBe("«1. a\n2. b»");
  });

  it("retire la numérotation quand elle est partout", () => {
    expect(rendu(basculerListeNumerotee(champ("«1. a\n2. b»")))).toBe("«a\nb»");
  });
});

describe("insererLien", () => {
  it("laisse dehors l'espace qu'un double-clic emporte", () => {
    expect(rendu(insererLien(champ("un «mot »ici"), "texte"))).toBe("un [mot](«») ici");
  });

  it("met le curseur sur l'adresse quand le texte est sélectionné", () => {
    expect(rendu(insererLien(champ("voir «ici»"), "texte"))).toBe("voir [ici](«»)");
  });

  it("sélectionne le texte à remplacer quand rien n'est sélectionné", () => {
    expect(rendu(insererLien(champ("voir «»"), "texte"))).toBe("voir [«texte»]()");
  });
});

describe("appliquerFormat", () => {
  it("route chaque nom vers sa transformation", () => {
    expect(appliquerFormat(champ("«x»"), "strike").value).toBe("~~x~~");
    expect(appliquerFormat(champ("«x»"), "underline").value).toBe("++x++");
    expect(appliquerFormat(champ("«x»"), "code").value).toBe("`x`");
    expect(appliquerFormat(champ("«x»"), "h1").value).toBe("# x");
    expect(appliquerFormat(champ("«x»"), "quote").value).toBe("> x");
    expect(appliquerFormat(champ("«x»"), "ordered").value).toBe("1. x");
    expect(appliquerFormat(champ("«x»"), "link").value).toBe("[x]()");
  });
});

describe("raccourciDe", () => {
  it("reconnaît les lettres sous Ctrl comme sous Cmd", () => {
    expect(raccourciDe(touche({ key: "b", ctrlKey: true }))).toBe("bold");
    expect(raccourciDe(touche({ key: "B", metaKey: true }))).toBe("bold");
    expect(raccourciDe(touche({ key: "k", ctrlKey: true }))).toBe("link");
  });

  it("distingue les combinaisons avec et sans Maj", () => {
    expect(raccourciDe(touche({ key: "x", ctrlKey: true }))).toBeNull();
    expect(raccourciDe(touche({ key: "x", ctrlKey: true, shiftKey: true }))).toBe("strike");
  });

  it("lit les chiffres sur la touche physique, pas sur le caractère produit", () => {
    // Ce que produit Ctrl+Maj+2 sur un clavier français : le caractère est un
    // chiffre, mais rien ne le garantit d'une disposition à l'autre.
    expect(raccourciDe(touche({ key: "2", code: "Digit2", ctrlKey: true, shiftKey: true })))
      .toBe("h2");
    // Et sur un clavier américain, la même touche produit `@`.
    expect(raccourciDe(touche({ key: "@", code: "Digit2", ctrlKey: true, shiftKey: true })))
      .toBe("h2");
  });

  it("laisse passer la frappe ordinaire et les combinaisons avec Alt", () => {
    expect(raccourciDe(touche({ key: "b" }))).toBeNull();
    // AltGr vaut Ctrl+Alt sous Windows : `Ctrl+Alt+3` est un `#` français, pas
    // une demande de titre.
    expect(raccourciDe(touche({ key: "#", code: "Digit3", ctrlKey: true, altKey: true })))
      .toBeNull();
  });
});

describe("libelleRaccourci", () => {
  it("écrit la combinaison selon la plateforme", () => {
    expect(libelleRaccourci("bold", false)).toBe("Ctrl+B");
    expect(libelleRaccourci("bold", true)).toBe("⌘+B");
    expect(libelleRaccourci("h2", false)).toBe("Ctrl+Maj+2");
    expect(libelleRaccourci("h2", true)).toBe("⌘+⇧+2");
  });
});
