import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Tout bouton et tout lien doit avoir un nom accessible.
//
// Vingt-trois boutons n'en avaient aucun : une icône lucide pour seul enfant,
// ou rien du tout — une pastille de couleur, un interrupteur. Un lecteur
// d'écran les annonce « bouton », sans plus. Supprimer un champ, changer une
// couleur, monter d'un cran : rien ne disait lequel faisait quoi.
//
// Les liens ont été ajoutés ensuite, après qu'axe en eut trouvé un au rendu
// que ce contrôle ne regardait pas : deux autres attendaient dans le code.
//
// La détection est volontairement PRUDENTE. Un composant maison peut rendre du
// texte (`PinCard`, `DmAvatar`) et une image porteuse d'un `alt` nomme déjà le
// bouton qui l'entoure : dans le doute on ne signale pas, quitte à manquer un
// cas, plutôt que d'imposer un `aria-label` là où il ferait doublon.
//
// ── Sur l'absence d'expressions régulières construites ───────
// Une classe de caractères écrite dans un littéral de gabarit y perd son
// antislash au passage — `[\s/>]` devient `[s/>]`, qui ne correspond presque à
// rien, et le contrôle passe alors à vide en paraissant vert. C'est arrivé
// ici. Le balayage des balises se fait donc par indexOf et codes de
// caractères, sans un seul échappement.
// ──────────────────────────────────────────────────────────────────────────

const ESPACE = 32;
const TABULATION = 9;
const SAUT_DE_LIGNE = 10;
const RETOUR_CHARIOT = 13;

/** Vrai si ce caractère termine un nom de balise. */
function finDeNom(c: string | undefined): boolean {
  if (c === undefined) return false;
  if (c === "/" || c === ">") return true;
  const n = c.charCodeAt(0);
  return n === ESPACE || n === SAUT_DE_LIGNE || n === TABULATION || n === RETOUR_CHARIOT;
}

/** Numéro de ligne (1-indexé) de la position `i`. */
function numeroDeLigne(src: string, i: number): number {
  let n = 1;
  for (let k = 0; k < i; k++) if (src.charCodeAt(k) === SAUT_DE_LIGNE) n++;
  return n;
}

/** Fin de la balise ouvrante, en ignorant `{}` et chaînes imbriqués. */
function finDeBaliseOuvrante(src: string, depart: number): number {
  let prof = 0;
  let dans: string | null = null;
  for (let j = depart; j < src.length; j++) {
    const c = src[j];
    if (dans) {
      if (c === dans) dans = null;
    } else if (c === '"' || c === "'") dans = c;
    else if (c === "{") prof++;
    else if (c === "}") prof--;
    else if (c === ">" && prof === 0) return j;
  }
  return src.length - 1;
}

type Element = { ouvrante: string; corps: string; ligne: number; index: number };

/** Chaque `<balise …>…</balise>` du fichier, avec son corps brut. */
export function elements(src: string, balise: string): Element[] {
  const out: Element[] = [];
  const ouvrant = "<" + balise;
  const fermant = "</" + balise;

  /** Prochaine ouvrante de CETTE balise (pas `<Buttonish>`), depuis `de`. */
  const prochaineOuvrante = (de: number): number => {
    for (let i = src.indexOf(ouvrant, de); i !== -1; i = src.indexOf(ouvrant, i + 1)) {
      if (finDeNom(src[i + ouvrant.length])) return i;
    }
    return -1;
  };

  for (let i = prochaineOuvrante(0); i !== -1; i = prochaineOuvrante(i + 1)) {
    const j = finDeBaliseOuvrante(src, i);
    const ouvrante = src.slice(i, j + 1);
    const ligne = numeroDeLigne(src, i);
    if (ouvrante.trimEnd().endsWith("/>")) {
      out.push({ ouvrante, corps: "", ligne, index: i });
      continue;
    }
    // Corps jusqu'à la fermeture correspondante, imbrications comprises.
    let niveau = 1;
    let k = j + 1;
    let curseur = j + 1;
    while (curseur < src.length) {
      const suivantFermant = src.indexOf(fermant, curseur);
      if (suivantFermant === -1) break;
      const suivantOuvrant = prochaineOuvrante(curseur);
      if (suivantOuvrant !== -1 && suivantOuvrant < suivantFermant) {
        niveau++;
        curseur = suivantOuvrant + ouvrant.length;
        continue;
      }
      niveau--;
      if (niveau === 0) {
        k = suivantFermant;
        break;
      }
      curseur = suivantFermant + fermant.length;
    }
    out.push({ ouvrante, corps: src.slice(j + 1, k), ligne, index: i });
  }
  return out;
}

/** Composants importés de `lucide-react` : ils ne rendent jamais de texte. */
export function iconesLucide(src: string): Set<string> {
  const noms = new Set<string>();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g)) {
    for (const brut of m[1].split(",")) {
      const n = brut.trim().split(" as ").pop()!.trim();
      if (n) noms.add(n);
    }
  }
  return noms;
}

/**
 * Vrai si RIEN dans ce corps ne peut produire de nom accessible.
 *
 * Un `{…}` quelconque suffit à faire renoncer : il peut porter `{t("…")}`,
 * `{label}`, n'importe quoi. Idem pour un composant maison.
 */
export function aucunNomPossible(corps: string, icones: Set<string>): boolean {
  let reste = corps.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  reste = reste.replace(/\/\/[^\n]*/g, "");
  for (let i = 0; i < 8; i++) {
    const n = reste.replace(/<[A-Za-z][^<>]*?\/>/g, (balise) => {
      const nom = /^<(\w+)/.exec(balise)![1];
      // Un `alt=""` explicite est une image décorative : elle ne nomme rien,
      // et le dire prime sur la prudence accordée aux composants inconnus.
      if (/alt=""/.test(balise)) return "";
      if (/alt=/.test(balise)) return "TEXTE"; // une image nommée nomme le bouton
      if (nom[0] === nom[0].toUpperCase() && !icones.has(nom)) return "TEXTE"; // peut parler
      return "";
    });
    if (n === reste) break;
    reste = n;
  }
  return !/[A-Za-zÀ-ÿ{]/.test(reste);
}

/** Un élément écrit à l'intérieur d'un commentaire ne rend rien. */
function dansUnCommentaire(src: string, i: number): boolean {
  const debutLigne = src.lastIndexOf("\n", i) + 1;
  const avant = src.slice(debutLigne, i).trimStart();
  if (avant.startsWith("//") || avant.startsWith("*") || avant.startsWith("/*")) return true;
  const ouvre = src.lastIndexOf("/*", i);
  return ouvre !== -1 && src.indexOf("*/", ouvre) > i;
}

function fichiersJsx(): string[] {
  const out: string[] = [];
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "__tests__") parcourir(chemin);
      } else if (e.name.endsWith(".tsx")) out.push(chemin);
    }
  };
  for (const d of ["app", "components"]) parcourir(join(process.cwd(), d));
  return out;
}

/**
 * Balises analysées.
 *
 * Les LIENS comptent autant que les boutons : un lien à icône seule est
 * annoncé « lien », sans plus. Deux avaient échappé au premier passage — la
 * modification d'un article de boutique, le téléchargement d'une image en
 * plein écran — et c'est axe, au rendu, qui avait signalé le troisième.
 */
const BALISES = ["button", "Button", "a", "Link"];

function analyse(): { total: number; fautifs: string[] } {
  let total = 0;
  const fautifs: string[] = [];
  for (const p of fichiersJsx()) {
    const src = readFileSync(p, "utf-8");
    const icones = iconesLucide(src);
    for (const balise of BALISES) {
      for (const el of elements(src, balise)) {
        if (dansUnCommentaire(src, el.index)) continue;
        total++;
        if (el.ouvrante.includes("aria-label") || el.ouvrante.includes("title=")) continue;
        if (el.corps.includes("sr-only")) continue;
        // `render={<Button …/>}` : le libellé vient du parent.
        if (src.slice(Math.max(0, el.index - 60), el.index).includes("render={")) continue;
        if (aucunNomPossible(el.corps, icones)) {
          fautifs.push(`  ${p.slice(process.cwd().length + 1)}:${el.ligne}`);
        }
      }
    }
  }
  return { total, fautifs };
}

describe("tout bouton et tout lien a un nom accessible", () => {
  it("trouve bien les boutons et les liens du dépôt", () => {
    // Garde-fou du garde-fou. Ce contrôle a DÉJÀ passé à vide une fois, faute
    // d'une classe de caractères écrite correctement : il ne trouvait alors
    // aucun élément et paraissait vert.
    const { total } = analyse();
    expect(fichiersJsx().length).toBeGreaterThan(150);
    expect(total).toBeGreaterThan(300);
  });

  it("reconnaît une icône seule, et laisse passer ce qui peut parler", () => {
    const icones = new Set(["Trash2", "Plus"]);
    expect(aucunNomPossible('<Trash2 className="h-3 w-3" />', icones)).toBe(true);
    expect(aucunNomPossible("", icones)).toBe(true);
    // Un composant maison peut rendre du texte : dans le doute, on se tait.
    expect(aucunNomPossible("<PinCard pin={p} />", icones)).toBe(false);
    // Une image nommée nomme le bouton qui l'entoure ; une décorative non.
    expect(aucunNomPossible("<Image src={u} alt={nom} />", icones)).toBe(false);
    expect(aucunNomPossible('<Image src={u} alt="" />', icones)).toBe(true);
    expect(aucunNomPossible('{t("delete")}', icones)).toBe(false);
    expect(aucunNomPossible("Supprimer", icones)).toBe(false);
  });

  it("découpe correctement une balise et son corps", () => {
    // La flèche d'un `onClick` contient un `>` : la balise ouvrante ne doit
    // pas s'arrêter là, sinon le corps analysé n'est pas le bon.
    const src = '<Button onClick={() => f(1)} disabled>\n  <Plus />\n</Button>';
    const [el] = elements(src, "Button");
    expect(el.ouvrante.endsWith("disabled>")).toBe(true);
    expect(el.corps.trim()).toBe("<Plus />");
  });

  it("aucun bouton ni lien n'est muet pour un lecteur d'écran", () => {
    const { fautifs } = analyse();
    expect(
      fautifs,
      fautifs.length
        ? "Boutons ou liens sans nom accessible : un lecteur d'écran les " +
          "annonce « bouton » ou « lien », sans dire lequel. Ajoutez un " +
          "`aria-label` traduit, ou un texte en `sr-only` : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });
});
