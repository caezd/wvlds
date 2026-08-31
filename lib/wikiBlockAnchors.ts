import { ANCHOR_CONTEXT_LENGTH, ANCHOR_MAX_QUOTE_LENGTH } from "./wikiAnnotations";

/**
 * Ancrage d'un commentaire sur un **bloc** du texte rendu — un paragraphe, un
 * élément de liste, une citation, un titre.
 *
 * ── Pourquoi pas d'identifiant écrit dans le markdown ──
 * Poser un `{#p-a1b2}` en fin de paragraphe donnerait une identité parfaite…
 * et visible : depuis que l'article s'écrit en markdown brut, l'auteur lirait
 * ces marqueurs, pourrait les effacer, et surtout les **dupliquer** d'un
 * copier-coller. Deux blocs porteraient alors le même identifiant et un
 * commentaire irait se poser sur le mauvais — une faute silencieuse, la pire
 * espèce.
 *
 * L'identité est donc **dérivée du contenu** : le type du bloc, son texte, et
 * celui de ses voisins. Insérer un bloc ne change le texte d'aucun autre, et
 * en déplacer un emporte le sien : les deux cas que l'ancrage par position ne
 * savait pas tenir se résolvent sans rien écrire nulle part.
 *
 * Ce qui reste hors de portée : **réécrire le bloc commenté lui-même**. Une
 * retouche est rattrapée par la ressemblance (voir `ressemblance`), une
 * réécriture complète détache le commentaire — état que l'interface annonce.
 *
 * C'est le même raisonnement que `resolveAnchor`, transposé du caractère au
 * bloc : chemin rapide sur la position mémorisée, puis meilleur candidat au
 * contexte, sinon rien.
 */

/** Un bloc du texte rendu, réduit à ce qui l'identifie. */
export type Bloc = {
  /** Nom de l'élément : `p`, `li`, `blockquote`, `h2`, `pre`, `td`. */
  type: string;
  /** Texte du bloc, déjà normalisé (voir `normaliserTexte`). */
  text: string;
};

export type BlockAnchor = {
  type: string;
  /** Texte du bloc, borné — un paragraphe peut être plus long que la colonne. */
  quote: string;
  /** Fin du bloc précédent, début du suivant : départage deux blocs jumeaux. */
  prefix: string;
  suffix: string;
  /** Index du bloc à l'écriture — chemin rapide, et dernier départage. */
  index: number;
};

/**
 * En dessous, deux blocs ne se ressemblent pas assez pour qu'on tienne l'un
 * pour l'autre édité.
 *
 * Mesuré sur les mots et non sur les caractères : corriger une faute de frappe
 * dans un paragraphe en garde la quasi-totalité, tandis que deux paragraphes
 * différents du même article partagent surtout des mots-outils, que la mesure
 * ne suffit pas à rapprocher.
 */
const SEUIL_RESSEMBLANCE = 0.6;

/** Espaces réduits et bords coupés : le rendu n'en garantit pas la forme. */
export function normaliserTexte(brut: string): string {
  return brut.replace(/\s+/g, " ").trim();
}

function borner(texte: string): string {
  return texte.slice(0, ANCHOR_MAX_QUOTE_LENGTH);
}

/**
 * Construit l'ancre du bloc d'index donné, ou `null` si le bloc n'existe pas
 * ou n'a pas de texte — on n'ancre rien sur du vide.
 */
export function buildBlockAnchor(blocs: Bloc[], index: number): BlockAnchor | null {
  const bloc = blocs[index];
  if (!bloc || !bloc.text) return null;

  const precedent = blocs[index - 1]?.text ?? "";
  const suivant = blocs[index + 1]?.text ?? "";

  return {
    type: bloc.type,
    quote: borner(bloc.text),
    prefix: precedent.slice(-ANCHOR_CONTEXT_LENGTH),
    suffix: suivant.slice(0, ANCHOR_CONTEXT_LENGTH),
    index,
  };
}

/** Part des mots communs aux deux textes (coefficient de Dice), de 0 à 1. */
export function ressemblance(a: string, b: string): number {
  if (a === b) return 1;
  const motsA = a.toLowerCase().split(" ").filter(Boolean);
  const motsB = b.toLowerCase().split(" ").filter(Boolean);
  if (!motsA.length || !motsB.length) return 0;

  // Multi-ensemble : un mot répété trois fois d'un côté et une seule de
  // l'autre ne doit compter qu'une correspondance.
  const restants = new Map<string, number>();
  for (const mot of motsB) restants.set(mot, (restants.get(mot) ?? 0) + 1);

  let communs = 0;
  for (const mot of motsA) {
    const reste = restants.get(mot) ?? 0;
    if (reste > 0) { communs++; restants.set(mot, reste - 1); }
  }

  return (2 * communs) / (motsA.length + motsB.length);
}

/** Part du voisinage retrouvée autour du candidat, de 0 à 1. */
function scoreDeContexte(blocs: Bloc[], i: number, anchor: BlockAnchor): number {
  const precedent = blocs[i - 1]?.text ?? "";
  const suivant = blocs[i + 1]?.text ?? "";
  const p = anchor.prefix ? (precedent.endsWith(anchor.prefix) ? 1 : 0) : 0.5;
  const s = anchor.suffix ? (suivant.startsWith(anchor.suffix) ? 1 : 0) : 0.5;
  return (p + s) / 2;
}

/**
 * Retrouve l'index du bloc ancré, ou `null` quand il a disparu — le
 * commentaire est alors détaché, et c'est à l'appelant de le dire.
 */
export function resolveBlockAnchor(blocs: Bloc[], anchor: BlockAnchor): number | null {
  if (!anchor.quote) return null;

  // Chemin rapide : rien n'a bougé à cette place.
  const surPlace = blocs[anchor.index];
  if (surPlace && surPlace.type === anchor.type && borner(surPlace.text) === anchor.quote) {
    return anchor.index;
  }

  let meilleur = -1;
  let meilleureRessemblance = 0;
  let meilleurContexte = -1;
  let meilleureDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < blocs.length; i++) {
    // Le type d'abord : un paragraphe repris en citation n'est plus le même
    // objet du texte, même mot pour mot.
    if (blocs[i].type !== anchor.type) continue;

    const r = ressemblance(borner(blocs[i].text), anchor.quote);
    if (r < SEUIL_RESSEMBLANCE) continue;

    const contexte = scoreDeContexte(blocs, i, anchor);
    const distance = Math.abs(i - anchor.index);

    // La ressemblance tranche ; le contexte départage deux blocs jumeaux ; la
    // distance ne sert que lorsque le voisinage lui-même se répète, où
    // l'ancienne place est le seul indice qui reste.
    const mieux =
      r > meilleureRessemblance ||
      (r === meilleureRessemblance &&
        (contexte > meilleurContexte ||
          (contexte === meilleurContexte && distance < meilleureDistance)));

    if (mieux) {
      meilleur = i;
      meilleureRessemblance = r;
      meilleurContexte = contexte;
      meilleureDistance = distance;
    }
  }

  return meilleur === -1 ? null : meilleur;
}
