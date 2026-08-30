import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Aucun texte d'interface en français codé en dur.
//
// La campagne i18n avait laissé des restes : des libellés d'aide, des
// descriptions de confirmation de suppression, des messages jetés par
// `throw new Error("…")` puis affichés tels quels. Une personne lisant
// l'application en anglais ou en espagnol recevait donc du français.
//
// Le contrôle de `actionErrors.test.ts` ne voyait que les retours
// `error: "…"` des actions serveur. Celui-ci couvre les deux autres formes :
// le texte posé dans un attribut JSX, et la phrase jetée en exception.
//
// Deux de ces restes tutoyaient — « Donne un nom à ton personnage » — ce que
// les traductions, elles, ne font jamais. C'est la conséquence directe d'un
// texte qui échappe aux fichiers de messages.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fichiers volontairement hors du contrôle.
 *
 * - `app/legal` : mentions légales, dont la traduction demande une relecture
 *   juridique et non une reformulation.
 * - `lib/patreon/client.ts` : erreurs de parsing d'une réponse d'API, qui
 *   restent côté serveur et ne sont jamais affichées.
 * - `lib/changelog.ts` : le journal des versions, rédigé en français.
 */
const EXEMPTS = [
  join("app", "legal"),
  join("lib", "patreon", "client.ts"),
  join("lib", "changelog.ts"),
];

/** Attributs dont la valeur finit sous les yeux de quelqu'un. */
const ATTRIBUTS = [
  "help", "label", "title", "placeholder", "description", "alt",
  "changeLabel", "emptyLabel", "hint", "tooltip",
];

/**
 * Mots-outils du français. Deux suffisent à qualifier une phrase : ils
 * n'apparaissent pas ensemble par hasard dans une chaîne technique.
 *
 * Les accents seuls ne suffisent pas comme critère — beaucoup de vraies
 * phrases n'en portent aucune (« Non connecte » aurait passé).
 */
const MOTS_OUTILS = new Set(
  ("le la les un une des du de au aux et ou est sont sera seront cette ce ces " +
   "cet pour dans par sur avec sans vous votre vos nous notre nos ne pas plus " +
   "que qui dont ou il elle ils elles on se sa son ses leur leurs tout toute " +
   "tous toutes sera etre a").split(" "),
);

/** Enlève les diacritiques, pour comparer sans dépendre de l'encodage. */
function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function estUnePhraseFrancaise(valeur: string): boolean {
  if (/^(https?:|\/|#|\.)/.test(valeur) || valeur.includes("://")) return false;
  const mots = sansAccents(valeur).toLowerCase().match(/[a-z']+/g) ?? [];
  return mots.filter((m) => MOTS_OUTILS.has(m)).length >= 2;
}

/** Tous les fichiers source de l'interface, hors tests et exemptions. */
function fichiersSource(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (EXEMPTS.some((x) => chemin.includes(x))) continue;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        parcourir(chemin);
      } else if (/\.tsx?$/.test(e.name)) {
        trouves.push(chemin);
      }
    }
  };
  for (const d of ["app", "components", "hooks", "lib"]) parcourir(join(process.cwd(), d));
  return trouves;
}

/** Signale `chemin:ligne — "texte"` pour chaque capture qui est une phrase. */
function releverPhrases(motif: RegExp): string[] {
  const fautifs: string[] = [];
  for (const p of fichiersSource()) {
    const lignes = readFileSync(p, "utf-8").split("\n");
    lignes.forEach((ligne, i) => {
      // Une ligne de commentaire n'atteint personne.
      const nue = ligne.trim();
      if (nue.startsWith("//") || nue.startsWith("*") || nue.startsWith("/*")) return;
      for (const m of ligne.matchAll(motif)) {
        const valeur = m[1].trim();
        if (estUnePhraseFrancaise(valeur)) {
          fautifs.push(`  ${p.slice(process.cwd().length + 1)}:${i + 1} — "${valeur}"`);
        }
      }
    });
  }
  return fautifs;
}

describe("aucun texte français codé en dur dans l'interface", () => {
  it("analyse bien les fichiers source", () => {
    // Un contrôle qui ne lirait aucun fichier passerait aussi.
    expect(fichiersSource().length).toBeGreaterThan(200);
  });

  it("reconnaît une phrase française et laisse passer le reste", () => {
    // La détection elle-même, éprouvée sur les cas qui l'ont mise en défaut.
    expect(estUnePhraseFrancaise("Le nom affiché partout dans l’app")).toBe(true);
    expect(estUnePhraseFrancaise("La salle et tous ses messages seront supprimés.")).toBe(true);
    // Sans accent : c'était le cas manquant d'une première version.
    expect(estUnePhraseFrancaise("Ce message sera supprime definitivement.")).toBe(true);
    expect(estUnePhraseFrancaise("flex items-center gap-2")).toBe(false);
    expect(estUnePhraseFrancaise("image/jpeg")).toBe(false);
    expect(estUnePhraseFrancaise("https://exemple.test/le/de")).toBe(false);
  });

  it("aucun attribut JSX ne porte de phrase française", () => {
    // L'espace initiale est LITTERALE, et c'est delibere : un attribut JSX
    // suit toujours une espace. Une limite de mot ecrite  dans un litteral
    // de gabarit vaut le caractere d'effacement U+0008, pas la limite voulue :
    // le motif ne correspondait alors a rien, et ce controle passait a vide.
    const motif = new RegExp(` (?:${ATTRIBUTS.join("|")})="([^"]{6,})"`, "g");
    const fautifs = releverPhrases(motif);
    expect(
      fautifs,
      fautifs.length
        ? "Texte d'interface en français codé en dur. Il s'affiche tel quel, " +
          "quelle que soit la langue choisie. Ajoutez une clé dans " +
          "messages/{fr,en,es}.json : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });

  it("aucune exception ne porte de phrase française", () => {
    // `throw new Error("Non connecté.")` finissait dans un `toast.error(e.message)`.
    const fautifs = releverPhrases(/new Error\(\s*"([^"]{6,})"/g);
    expect(
      fautifs,
      fautifs.length
        ? "Phrase française jetée en exception. Plusieurs `catch` affichent " +
          "`e.message` : elle atteint l'écran. Jetez un code de " +
          "`lib/actionErrors.ts` : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });

  it("aucune valeur par défaut de paramètre n'est une phrase française", () => {
    // `deleteDescription = "Cet élément sera supprimé définitivement."` : le
    // texte n'était ni dans un attribut ni dans une exception, donc invisible
    // pour les deux contrôles ci-dessus — et il s'affichait tel quel dans les
    // trois langues, à chaque suppression d'un bloc de message.
    const fautifs = releverPhrases(/^\s*\w+ = "([^"]{6,})",?\s*$/gm);
    expect(
      fautifs,
      fautifs.length
        ? "Valeur par défaut en français. Elle s'affiche quand l'appelant ne " +
          "fournit rien, dans toutes les langues. Rendez le paramètre " +
          "facultatif et traduisez le repli : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });

  it("aucun `catch` n'affiche le message brut de l'erreur", () => {
    // `toast.error(e.message)` sur un `throw error` de Supabase affiche le
    // texte de PostgreSQL — « new row violates row-level security policy for
    // table "worlds" » — qui nomme la table et la règle.
    const fautifs: string[] = [];
    for (const p of fichiersSource()) {
      const src = readFileSync(p, "utf-8");
      for (const m of src.matchAll(
        /(?:toast\.error|setError)\(\s*\w+\s+instanceof\s+Error\s*\?\s*\w+\.message/g,
      )) {
        fautifs.push(`  ${p.slice(process.cwd().length + 1)} — ${m[0].slice(0, 60)}`);
      }
    }
    expect(
      fautifs,
      fautifs.length
        ? "Message brut d'erreur affiché à l'écran. Il vient de PostgreSQL et " +
          "cite le nom des tables et des policies. Passez par " +
          "`messageErreurAction(...)` : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });
});
