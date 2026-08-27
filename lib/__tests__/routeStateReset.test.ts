import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Naviguer entre deux valeurs d'un même segment dynamique (/c/A → /c/B,
// /w/A → /w/B) ne remonte PAS les composants : même type d'élément, même
// position dans l'arbre, aucun `key`. Next se contente de leur passer de
// nouveaux props.
//
// Conséquence : tout `useState(initialX)` garde la valeur de la page
// précédente, l'initialiseur d'un `useState` ne s'exécutant qu'au montage.
// Chaque état semé par un prop doit donc être resemé dans un effet dont la
// dépendance est l'identifiant de route.
//
// Cinq états y échappaient : les épingles et l'étoile « suivi » d'un salon,
// ses badges de défi gagné, le favori et la catégorie sélectionnée d'un monde,
// et trois listes de salons. Ce test empêche le prochain oubli. Il est
// volontairement statique : ces vues sont trop lourdes à monter en test, et
// c'est la présence du resemis qu'on veut garantir, pas son détail.
// ──────────────────────────────────────────────────────────────────────────

/** Composants qui survivent à un changement d'identifiant de route. */
const SURVIVORS: { file: string; routeId: string }[] = [
  { file: join("app", "(protected)", "c", "[id]", "view.tsx"), routeId: "chatId" },
  { file: join("components", "worlds", "home", "WorldHome.tsx"), routeId: "worldId" },
  { file: join("components", "worlds", "sidebar", "WorldSidebarChatrooms.tsx"), routeId: "worldId" },
  { file: join("components", "worlds", "chatrooms", "WorldChatroomsGrid.tsx"), routeId: "worldId" },
  { file: join("components", "worlds", "chatrooms", "WorldCategoryFolders.tsx"), routeId: "worldId" },
];

/** `const [x, setX] = useState…(initialX…)` — le setter et le prop qui le sème. */
function statesSeededFromProps(source: string): { setter: string; prop: string }[] {
  // `[^;]` borne la recherche à une seule instruction : sans ça le motif
  // débordait sur la déclaration suivante et attribuait son prop `initial*`
  // au setter précédent.
  const re = /const \[\s*\w+\s*,\s*(set\w+)\s*\][^=;]*=\s*useState[^;]{0,140}?(initial[A-Z]\w*)/g;
  return [...source.matchAll(re)].map((m) => ({ setter: m[1], prop: m[2] }));
}

/**
 * Concaténation de tout ce qui resème l'état quand `routeId` change. Deux
 * formes sont acceptées :
 *
 *  - `useResetOnKeyChange(routeId, () => { … })` — la forme recommandée, qui
 *    resème pendant le rendu et évite d'afficher une image de la page quittée ;
 *  - `useEffect(() => { … }, [routeId])` — la forme historique, conservée là
 *    où l'effet fait bien plus que resemer (cf. la vue d'un salon, qui y
 *    marque aussi la lecture et publie le salon actif).
 */
function resetBlocks(source: string, routeId: string): string {
  let out = "";
  for (const [opener, marker] of [
    [`useResetOnKeyChange(${routeId},`, "  });"],
    ["useEffect(", `}, [${routeId}]);`],
  ] as const) {
    let from = 0;
    for (;;) {
      const start = source.indexOf(opener, from);
      if (start === -1) break;
      const end = source.indexOf(marker, start);
      if (end === -1) break;
      out += source.slice(start, end);
      from = end + marker.length;
    }
  }
  return out;
}

/**
 * Le corps contient-il un appel `setX(…)` dont l'argument mentionne `prop` ?
 *
 * Un simple `body.includes("setX(")` ne suffit pas : ces effets appellent
 * souvent le même setter avec le résultat d'une requête Realtime. C'est bien
 * un resemis depuis le PROP qu'on exige. Balayage littéral plutôt que regex,
 * pour n'avoir aucun échappement à maintenir.
 */
function reseedsFromProp(body: string, setter: string, prop: string): boolean {
  const call = `${setter}(`;
  for (let i = body.indexOf(call); i !== -1; i = body.indexOf(call, i + 1)) {
    const rest = body.slice(i + call.length, i + call.length + 140);
    const statement = rest.split(";")[0];
    if (statement.includes(prop)) return true;
  }
  return false;
}

describe.each(SURVIVORS)("$file — état resemé au changement de route", ({ file, routeId }) => {
  const source = readFileSync(join(process.cwd(), file), "utf-8");

  it("expose au moins un état semé par un prop `initial*`", () => {
    // Garde-fou du garde-fou : sans lui, une extraction cassée ferait passer
    // le test suivant à vide.
    expect(statesSeededFromProps(source).length).toBeGreaterThan(0);
  });

  it(`resème chacun d'eux quand \`${routeId}\` change`, () => {
    const body = resetBlocks(source, routeId);
    expect(body, `aucun resemis sur \`${routeId}\` trouvé`).not.toBe("");
    const oublis = statesSeededFromProps(source)
      .filter(({ setter, prop }) => !reseedsFromProp(body, setter, prop))
      .map((o) => `${o.setter} (semé par ${o.prop})`);
    expect(oublis, "états semés par un prop mais jamais resemés").toEqual([]);
  });
});
