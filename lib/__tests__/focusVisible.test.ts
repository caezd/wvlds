import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Une commande révélée au survol doit aussi se révéler au focus.
//
// L'application cache une trentaine de commandes derrière `opacity-0` et les
// fait apparaître au survol de leur bloc : les actions d'un message, la
// suppression d'une bannière, les poignées d'un champ de persona, les boutons
// d'une carte de monde. C'est une convention d'interface courante.
//
// Aucune n'avait de variante de focus. Elles restaient donc atteignables à la
// tabulation — et parfaitement INVISIBLES une fois atteintes. Mesuré dans un
// salon : « Actions » et « Ajouter une réaction » recevaient le focus à
// `opacity: 0`, alors que toutes les autres commandes de la page étaient à 1.
// C'est le critère WCAG 2.4.7, « visibilité du focus », niveau AA.
//
// Vérifié plutôt que supposé : en retirant la classe à chaud dans le
// navigateur, l'opacité sous focus repasse de 1 à 0.
//
// ── Pourquoi `focus-within` et pas `focus` ──────────────────
// La seule tentative qui existait, sur un conteneur d'actions, utilisait
// `focus:opacity-100` — qui ne réagit qu'au focus de l'élément LUI-MÊME, pas
// de ses descendants. Un conteneur ne reçoit jamais le focus : la règle ne
// servait à rien. `focus-within` couvre les deux cas, l'élément et sa
// descendance, et convient donc aussi bien à un bouton qu'à une barre d'outils.
// ──────────────────────────────────────────────────────────────────────────

/** Une révélation au survol : `hover:opacity-100`, avec ou sans groupe. */
const REVELE_AU_SURVOL = /(?:group-)?hover(?:\/[\w-]+)?:opacity-100/;

/** Une variante qui réagit au clavier, avec ou sans groupe — symétrique de
 *  `REVELE_AU_SURVOL` : `group-focus-within/img:opacity-100` révèle bien la
 *  tuile dès qu'une de ses commandes reçoit le focus. */
const REVELE_AU_FOCUS = /(?:group-)?focus(?:-within|-visible)?(?:\/[\w-]+)?:opacity-100/;

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

/** Lignes qui révèlent au survol sans rien prévoir pour le clavier. */
function sansVarianteDeFocus(): { fautifs: string[]; total: number } {
  const fautifs: string[] = [];
  let total = 0;
  for (const p of fichiersJsx()) {
    const lignes = readFileSync(p, "utf-8").split("\n");
    lignes.forEach((ligne, i) => {
      if (!ligne.includes("opacity-0") || !REVELE_AU_SURVOL.test(ligne)) return;
      total++;
      if (REVELE_AU_FOCUS.test(ligne)) return;
      fautifs.push(`  ${p.slice(process.cwd().length + 1)}:${i + 1}`);
    });
  }
  return { fautifs, total };
}

describe("les commandes révélées au survol le sont aussi au focus", () => {
  it("trouve bien le motif dans le dépôt", () => {
    // Un contrôle qui n'analyserait aucune ligne passerait aussi.
    const { total } = sansVarianteDeFocus();
    expect(fichiersJsx().length).toBeGreaterThan(150);
    expect(total).toBeGreaterThan(20);
  });

  it("reconnaît les deux variantes acceptables, et refuse `focus:` sur un conteneur", () => {
    expect(REVELE_AU_SURVOL.test("opacity-0 group-hover/turn-messages:opacity-100")).toBe(true);
    expect(REVELE_AU_SURVOL.test("opacity-0 hover:opacity-100")).toBe(true);
    expect(REVELE_AU_FOCUS.test("focus-within:opacity-100")).toBe(true);
    expect(REVELE_AU_FOCUS.test("focus-visible:opacity-100")).toBe(true);
    expect(REVELE_AU_FOCUS.test("group-focus-within/img:opacity-100")).toBe(true);
    // `focus:` seul est accepté par le motif : sur une commande il suffit.
    // C'est sur un CONTENEUR qu'il ne sert à rien, et cela, seule la lecture
    // du code le dit — d'où la préférence documentée pour `focus-within`.
    expect(REVELE_AU_FOCUS.test("focus:opacity-100")).toBe(true);
    expect(REVELE_AU_FOCUS.test("opacity-0 group-hover:opacity-100")).toBe(false);
  });

  it("aucune commande n'est invisible sous le focus", () => {
    const { fautifs } = sansVarianteDeFocus();
    expect(
      fautifs,
      fautifs.length
        ? "Commandes révélées au survol seulement. Elles restent atteignables " +
          "à la tabulation, mais invisibles une fois atteintes. Ajoutez " +
          "`focus-within:opacity-100` : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });
});
