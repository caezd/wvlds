/**
 * Mise en forme markdown appliquée à la sélection d'un champ de texte.
 *
 * Tout est pur et sans DOM : l'appelant lit `selectionStart`/`selectionEnd`
 * sur son `<textarea>`, applique, puis réécrit la valeur et repose la
 * sélection. C'est ce qui rend ces règles vérifiables — une régression de
 * curseur s'écrit ici en une assertion, au lieu de piloter un champ réel.
 *
 * La syntaxe suivie est celle que rend l'application : markdown GFM, plus les
 * deux marqueurs maison de `lib/textStyledSpans.ts` (`++souligné++`, la
 * couleur restant réservée au composeur de salon).
 */

export type ChampTexte = {
  value: string;
  /** Début de la sélection, en caractères. */
  start: number;
  /** Fin de la sélection ; égale à `start` quand rien n'est sélectionné. */
  end: number;
};

export type NomFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "link"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "ordered"
  | "quote";

/** Marqueurs qui encadrent un passage. */
const ENVELOPPES: Partial<Record<NomFormat, string>> = {
  bold: "**",
  italic: "*",
  underline: "++",
  strike: "~~",
  code: "`",
};

/** Marqueurs qui ouvrent une ligne. */
const PREFIXES: Partial<Record<NomFormat, string>> = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  bullet: "- ",
  quote: "> ",
};

/**
 * Tout préfixe de ligne que les outils savent poser.
 *
 * Retiré avant d'en poser un autre : passer un titre 1 en titre 2 doit le
 * remplacer, pas écrire `## # `. Une puce et une citation s'excluent de même.
 */
const PREFIXE_POSE = /^(?:#{1,6} |> |- |\d+\. )/;

/**
 * Le passage est-il déjà encadré par ce marqueur, juste à l'extérieur de la
 * sélection ?
 *
 * Le refus quand le caractère voisin répète le marqueur évite qu'un `*`
 * dénude un `**` : sélectionner `gras` dans `**gras**` et demander l'italique
 * doit ajouter des étoiles, pas en retirer.
 */
function estEnveloppee(v: string, start: number, end: number, marqueur: string): boolean {
  const n = marqueur.length;
  const c = marqueur[0];
  return (
    start >= n &&
    v.slice(start - n, start) === marqueur &&
    v.slice(end, end + n) === marqueur &&
    v[start - n - 1] !== c &&
    v[end + n] !== c
  );
}

/**
 * Rétrécit la sélection sur son texte utile.
 *
 * Un double-clic sur un mot emporte l'espace qui le suit — c'est le
 * comportement de tous les navigateurs. Or `**mot **` n'est pas du gras :
 * CommonMark refuse un délimiteur fermant précédé d'une espace, et laisse
 * alors les étoiles en toutes lettres. Le geste le plus courant qui soit —
 * double-cliquer un mot, cliquer « Gras » — ne produisait donc rien, et
 * paraissait ignorer la sélection.
 *
 * Les espaces restent à l'extérieur des marqueurs. Une sélection qui n'est QUE
 * de l'espace n'a pas de texte utile : on la laisse telle quelle plutôt que de
 * la réduire à un point.
 */
function sansLesBords(v: string, start: number, end: number): [number, number] {
  let debut = start;
  let fin = end;
  while (debut < fin && /\s/.test(v[debut])) debut++;
  while (fin > debut && /\s/.test(v[fin - 1])) fin--;
  return debut === fin ? [start, end] : [debut, fin];
}

/**
 * Sélection sur laquelle agir : celle que porte le champ, ou la dernière
 * retenue quand le champ n'en a plus.
 *
 * Lire `selectionStart` au moment d'agir suppose que la sélection a survécu
 * depuis le geste de l'utilisateur jusqu'au clic sur le bouton. Elle ne
 * survit pas toujours : il suffit que quelque chose réécrive la valeur du
 * champ entre les deux pour que le navigateur replie le curseur, sans que
 * l'événement `select` en dise rien — et la mise en forme encadrait alors le
 * vide.
 *
 * La dernière sélection retenue, elle, vient de l'utilisateur. On ne s'en sert
 * que si elle tient encore dans le texte : une sélection d'un texte plus long
 * n'a plus de sens ici.
 */
export function selectionRetenue(
  duChamp: [number, number],
  derniere: [number, number],
  longueur: number,
): [number, number] {
  if (duChamp[0] !== duChamp[1]) return duChamp;

  const [debut, fin] = derniere;
  return debut !== fin && debut >= 0 && fin <= longueur ? derniere : duChamp;
}

/** Pose le marqueur autour de la sélection, ou le retire s'il y est déjà. */
export function basculerEnveloppe(champ: ChampTexte, marqueur: string): ChampTexte {
  const { value } = champ;
  const n = marqueur.length;
  const [start, end] = sansLesBords(value, champ.start, champ.end);

  if (estEnveloppee(value, start, end, marqueur)) {
    return {
      value: value.slice(0, start - n) + value.slice(start, end) + value.slice(end + n),
      start: start - n,
      end: end - n,
    };
  }

  // Sélection qui embrasse ses propres marqueurs — ce qu'un double-clic sur un
  // mot en gras donne facilement.
  const selection = value.slice(start, end);
  if (
    selection.length >= 2 * n &&
    selection.startsWith(marqueur) &&
    selection.endsWith(marqueur)
  ) {
    return {
      value: value.slice(0, start) + selection.slice(n, -n) + value.slice(end),
      start,
      end: end - 2 * n,
    };
  }

  return {
    value: value.slice(0, start) + marqueur + selection + marqueur + value.slice(end),
    // Sur une sélection vide, les deux bornes se rejoignent entre les
    // marqueurs : le curseur attend la frappe au bon endroit.
    start: start + n,
    end: end + n,
  };
}

/** Bornes des lignes que la sélection touche, même partiellement. */
function bornesDesLignes(v: string, start: number, end: number): { debut: number; fin: number } {
  // Une sélection qui s'arrête juste après un retour à la ligne ne doit pas
  // embarquer la ligne suivante, que l'utilisateur n'a pas vue surlignée.
  const finVisee = end > start && v[end - 1] === "\n" ? end - 1 : end;
  const debut = v.lastIndexOf("\n", start - 1) + 1;
  const apres = v.indexOf("\n", finVisee);
  return { debut, fin: apres === -1 ? v.length : apres };
}

/** Applique une transformation ligne à ligne et fait suivre la sélection. */
function retravaillerLignes(
  champ: ChampTexte,
  transformer: (lignes: string[]) => string[],
): ChampTexte {
  const { value, start, end } = champ;
  const { debut, fin } = bornesDesLignes(value, start, end);
  const avant = value.slice(debut, fin).split("\n");
  const apres = transformer(avant);

  // La sélection suit son texte : son début se décale de ce qu'a gagné ou
  // perdu la première ligne, sa fin de ce qu'a gagné ou perdu l'ensemble.
  // Sauf si elle commençait en début de ligne : le marqueur qu'on vient d'y
  // poser appartient à la ligne sélectionnée, il doit le rester.
  const surPremiere = apres[0].length - avant[0].length;
  const surTout = apres.join("\n").length - avant.join("\n").length;

  return {
    value: value.slice(0, debut) + apres.join("\n") + value.slice(fin),
    start: start === debut ? debut : Math.max(debut, start + surPremiere),
    end: Math.max(debut, end + surTout),
  };
}

/** Pose le préfixe sur chaque ligne touchée, ou le retire s'il y est partout. */
export function basculerPrefixe(champ: ChampTexte, prefixe: string): ChampTexte {
  return retravaillerLignes(champ, lignes => {
    const partout = lignes.every(l => l.startsWith(prefixe));
    return lignes.map(l => {
      const nue = l.replace(PREFIXE_POSE, "");
      return partout ? nue : prefixe + nue;
    });
  });
}

/** Numérote les lignes touchées, ou retire la numérotation si elle y est. */
export function basculerListeNumerotee(champ: ChampTexte): ChampTexte {
  return retravaillerLignes(champ, lignes => {
    const partout = lignes.every(l => /^\d+\. /.test(l));
    return lignes.map((l, i) => {
      const nue = l.replace(PREFIXE_POSE, "");
      return partout ? nue : `${i + 1}. ${nue}`;
    });
  });
}

/**
 * Insère un lien markdown.
 *
 * Le curseur se pose sur ce qu'il reste à écrire : l'adresse quand le texte
 * était sélectionné, le texte quand il ne l'était pas.
 */
export function insererLien(champ: ChampTexte, texteParDefaut: string): ChampTexte {
  const { value } = champ;
  // Même égard qu'aux enveloppes : l'espace emporté par un double-clic reste
  // hors du libellé, où il ne ferait qu'allonger la zone cliquable.
  const [start, end] = sansLesBords(value, champ.start, champ.end);
  const vide = start === end;
  const texte = vide ? texteParDefaut : value.slice(start, end);

  return {
    value: `${value.slice(0, start)}[${texte}]()${value.slice(end)}`,
    start: start + (vide ? 1 : texte.length + 3),
    end: start + (vide ? 1 + texte.length : texte.length + 3),
  };
}

/**
 * Applique un format nommé.
 *
 * `texteLien` est le mot déposé dans un lien créé sans sélection : il vient de
 * la traduction, d'où son passage en paramètre plutôt qu'une constante.
 */
export function appliquerFormat(
  champ: ChampTexte,
  nom: NomFormat,
  texteLien = "texte",
): ChampTexte {
  const enveloppe = ENVELOPPES[nom];
  if (enveloppe) return basculerEnveloppe(champ, enveloppe);

  const prefixe = PREFIXES[nom];
  if (prefixe) return basculerPrefixe(champ, prefixe);

  if (nom === "ordered") return basculerListeNumerotee(champ);
  return insererLien(champ, texteLien);
}

/**
 * Plus petit remplacement qui mène de `ancien` à `nouveau` : le préfixe et le
 * suffixe communs restent en place.
 *
 * Sert à ne toucher que ce qui change vraiment. Une entrée d'annulation qui
 * porterait sur l'article entier ramènerait tout le texte d'un coup ; celle-ci
 * ne porte que sur le passage mis en forme.
 */
export function differenceMinimale(
  ancien: string,
  nouveau: string,
): { debut: number; fin: number; texte: string } {
  const commun = Math.min(ancien.length, nouveau.length);

  let debut = 0;
  while (debut < commun && ancien[debut] === nouveau[debut]) debut++;

  let queue = 0;
  while (
    queue < commun - debut &&
    ancien[ancien.length - 1 - queue] === nouveau[nouveau.length - 1 - queue]
  ) {
    queue++;
  }

  return {
    debut,
    fin: ancien.length - queue,
    texte: nouveau.slice(debut, nouveau.length - queue),
  };
}

/** Description d'un raccourci, pour l'infobulle des boutons. */
export type Raccourci = { touche: string; maj?: boolean };

/**
 * Raccourcis clavier, dans les conventions des éditeurs de texte usuels.
 *
 * Les chiffres passent par `code` et non par `key` : sur un clavier AZERTY,
 * la rangée numérique ne produit un chiffre qu'avec Maj, et `key` vaudrait
 * alors `"&"` ou `"*"` selon la disposition. `Digit3` désigne la même touche
 * partout. Les lettres, elles, passent par `key` : on vise le B étiqueté B,
 * où qu'il soit posé.
 *
 * Ni Alt ni AltGr nulle part : sous Windows, AltGr **est** Ctrl+Alt, et un
 * `Ctrl+Alt+3` volerait le `#` d'un clavier français — le caractère même dont
 * un titre a besoin.
 */
export const RACCOURCIS: Record<NomFormat, Raccourci> = {
  bold: { touche: "b" },
  italic: { touche: "i" },
  underline: { touche: "u" },
  code: { touche: "e" },
  link: { touche: "k" },
  strike: { touche: "x", maj: true },
  h1: { touche: "Digit1", maj: true },
  h2: { touche: "Digit2", maj: true },
  h3: { touche: "Digit3", maj: true },
  ordered: { touche: "Digit7", maj: true },
  bullet: { touche: "Digit8", maj: true },
  quote: { touche: "Digit9", maj: true },
};

export type ToucheAppuyee = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** Format demandé par cette frappe, ou `null` si elle ne nous concerne pas. */
export function raccourciDe(e: ToucheAppuyee): NomFormat | null {
  // Ctrl OU Cmd, jamais aucun des deux, et jamais Alt : la combinaison doit
  // rester celle d'un raccourci d'édition, pas d'une saisie de caractère.
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null;

  for (const [nom, r] of Object.entries(RACCOURCIS) as [NomFormat, Raccourci][]) {
    if (Boolean(r.maj) !== e.shiftKey) continue;
    const frappee = r.touche.startsWith("Digit") ? e.code : e.key.toLowerCase();
    if (frappee === r.touche) return nom;
  }
  return null;
}

/** Libellé du raccourci, tel qu'on l'affiche dans une infobulle. */
export function libelleRaccourci(nom: NomFormat, mac: boolean): string {
  const { touche, maj } = RACCOURCIS[nom];
  const affichee = touche.startsWith("Digit") ? touche.slice(5) : touche.toUpperCase();
  return [mac ? "⌘" : "Ctrl", maj ? (mac ? "⇧" : "Maj") : null, affichee]
    .filter(Boolean)
    .join("+");
}
