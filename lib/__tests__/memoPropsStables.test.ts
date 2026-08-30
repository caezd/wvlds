import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Un composant enveloppé dans `memo` ne doit recevoir aucune prop créée à la
// volée.
//
// `memo` compare les props par identité. Une fonction fléchée, un tableau ou
// un objet écrit dans le JSX est NEUF à chaque rendu du parent : la
// comparaison échoue toujours, et le composant est reconstruit malgré tout.
//
// Rien ne casse. C'est le problème : le défaut est silencieux, aucun test ne
// tombe, et il ne se voit qu'au chronomètre.
//
// ── Ce qu'il coûtait ────────────────────────────────────────
// `ChatroomMessage` est le seul composant mémorisé de l'application, et c'est
// la liste la plus chargée : vingt messages avec leurs blocs, leur markdown et
// leurs réactions. Quatre de ses props étaient des fonctions écrites dans le
// JSX du parent — `onUpdated`, `onRequestDelete`, `onAnchorEdited`, `onPin`.
// Trois autres avaient bien été stabilisées ; le travail s'était arrêté là.
//
// Les vingt messages étaient donc reconstruits à chaque arrivée d'état — et il
// en arrive beaucoup, tardivement : la clé du salon, les épingles, les badges
// de défi, la présence. Mesuré au profileur, à 4× de ralentissement CPU et sur
// un réseau mobile : sept tâches longues, 853 ms de fil principal bloqué après
// le chargement, dont une seule de 370 ms.
//
// `onRequestDelete` a demandé un changement de signature : elle fermait sur
// `message.id`, donc une fonction par message et par rendu, impossible à
// stabiliser depuis le parent. Elle reçoit désormais l'identifiant, et la
// fermeture est construite dans le composant mémorisé lui-même.
// ──────────────────────────────────────────────────────────────────────────

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
 * Noms sous lesquels un composant mémorisé peut apparaître dans du JSX.
 *
 * `export default memo(X)` s'importe sous n'importe quel nom : on retient donc
 * aussi celui du fichier, qui est la convention suivie ici.
 */
export function composantsMemorises(fichiers: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of fichiers) {
    const src = readFileSync(p, "utf-8");
    let trouve = false;
    for (const m of src.matchAll(/memo\(\s*(\w+)\s*\)/g)) {
      out.set(m[1], p);
      trouve = true;
    }
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*memo\(/g)) {
      out.set(m[1], p);
      trouve = true;
    }
    if (trouve) out.set(basename(p).replace(/\.tsx$/, ""), p);
  }
  return out;
}

/**
 * Props dont la valeur est construite dans le JSX.
 *
 * Fonction fléchée, `function`, littéral de tableau ou d'objet : toutes ont une
 * identité neuve à chaque rendu. Une simple lecture (`prop={x.y}`) ou un appel
 * (`prop={f(x)}`) ne sont pas visés : leur valeur peut très bien être stable,
 * et l'exiger reviendrait à interdire d'écrire du JSX.
 */
export function propsInstables(baliseOuvrante: string): string[] {
  const out: string[] = [];
  const motif = /(\w+)=\{\s*(\([^)]*\)\s*=>|\w+\s*=>|function\b|\[|\{)/g;
  for (const m of baliseOuvrante.matchAll(motif)) out.push(m[1]);
  return out;
}

describe("les composants mémorisés reçoivent des props stables", () => {
  const fichiers = fichiersJsx();

  it("trouve bien les fichiers et au moins un composant mémorisé", () => {
    // Un contrôle qui n'analyserait rien passerait aussi.
    expect(fichiers.length).toBeGreaterThan(150);
    expect(composantsMemorises(fichiers).size).toBeGreaterThan(0);
  });

  it("reconnaît une prop instable, et laisse passer le reste", () => {
    expect(propsInstables("<X onDelete={() => f(1)} />")).toEqual(["onDelete"]);
    expect(propsInstables("<X onDelete={id => f(id)} />")).toEqual(["onDelete"]);
    expect(propsInstables("<X items={[1, 2]} />")).toEqual(["items"]);
    expect(propsInstables("<X style={{ color: 'red' }} />")).toEqual(["style"]);
    // Une lecture ou un appel peuvent parfaitement rendre une valeur stable.
    expect(propsInstables("<X onDelete={handleDelete} value={m.id} n={f(m)} />")).toEqual([]);
    expect(propsInstables('<X label="texte" />')).toEqual([]);
  });

  it("aucune prop créée à la volée sur un composant mémorisé", () => {
    const memos = composantsMemorises(fichiers);
    const fautifs: string[] = [];
    for (const p of fichiers) {
      const src = readFileSync(p, "utf-8");
      for (const nom of memos.keys()) {
        let depuis = 0;
        for (;;) {
          const i = src.indexOf("<" + nom, depuis);
          if (i === -1) break;
          depuis = i + 1;
          const apres = src[i + nom.length + 1];
          if (apres !== " " && apres !== "\n" && apres !== "\t" && apres !== "/" && apres !== ">") {
            continue; // `<ChatroomMessageHeader>` n'est pas `<ChatroomMessage>`
          }
          const ouvrante = src.slice(i, finDeBaliseOuvrante(src, i) + 1);
          for (const prop of propsInstables(ouvrante)) {
            const ligne = src.slice(0, i).split("\n").length;
            fautifs.push(`  ${p.slice(process.cwd().length + 1)}:${ligne} — <${nom}> ${prop}`);
          }
        }
      }
    }
    expect(
      fautifs,
      fautifs.length
        ? "Props créées à la volée sur un composant `memo`. Leur identité " +
          "change à chaque rendu du parent : la mémorisation ne sert plus à " +
          "rien, et rien ne le signale. Stabilisez-les avec `useCallback` ou " +
          "`useMemo` : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });
});
