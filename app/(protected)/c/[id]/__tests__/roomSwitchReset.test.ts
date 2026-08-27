import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// `ChatRoomView` n'est pas remonté quand on navigue d'un salon à l'autre :
// c'est le même composant, à la même position dans l'arbre, sans `key`. Next
// se contente de lui passer de nouveaux props.
//
// Conséquence : tout `useState(initialX)` garde la valeur du salon PRÉCÉDENT,
// puisqu'un initialiseur de `useState` ne s'exécute qu'au montage. Chaque état
// semé par un prop `initial*` doit donc être resemé explicitement dans l'effet
// `[chatId]`.
//
// Deux l'avaient été oubliés — l'étoile « suivi » restait celle du salon
// quitté, et les badges de défi gagné du nouveau salon n'arrivaient qu'après
// un rechargement complet. Ce test empêche le prochain oubli : il est
// volontairement statique, la vue étant trop lourde à monter en test.
// ──────────────────────────────────────────────────────────────────────────

const VIEW = join(process.cwd(), "app", "(protected)", "c", "[id]", "view.tsx");
const source = readFileSync(VIEW, "utf-8");

/** Corps de l'effet de réinitialisation, celui dont les deps sont `[chatId]`. */
function resetEffectBody(): string {
  const marker = "}, [chatId]);";
  const end = source.indexOf(marker);
  expect(end, "effet de réinitialisation `[chatId]` introuvable").toBeGreaterThan(-1);
  const start = source.lastIndexOf("useEffect(", end);
  return source.slice(start, end);
}

/** `const [x, setX] = useState…(initialX…)` → nom du setter. */
function statesSeededFromProps(): { setter: string; prop: string }[] {
  const re = /const \[\s*\w+\s*,\s*(set\w+)\s*\][^=]*=\s*useState[\s\S]{0,120}?(initial[A-Z]\w*)/g;
  const out: { setter: string; prop: string }[] = [];
  for (const m of source.matchAll(re)) out.push({ setter: m[1], prop: m[2] });
  return out;
}

describe("ChatRoomView — réinitialisation au changement de salon", () => {
  it("détecte bien les états semés par un prop `initial*`", () => {
    const seeded = statesSeededFromProps();
    // Garde-fou du garde-fou : si l'extraction ne trouve plus rien, le test
    // passerait à vide.
    expect(seeded.length).toBeGreaterThanOrEqual(5);
  });

  it("resème chacun d'eux dans l'effet `[chatId]`", () => {
    const body = resetEffectBody();
    const oublis = statesSeededFromProps().filter(({ setter }) => !body.includes(`${setter}(`));
    expect(
      oublis.map((o) => `${o.setter} (semé par ${o.prop})`),
      "états semés par un prop mais jamais resemés au changement de salon",
    ).toEqual([]);
  });

  it("l'effet de réinitialisation ne dépend que de `chatId`", () => {
    // Ajouter une autre dépendance rejouerait la réinitialisation au sein d'un
    // même salon, effaçant les messages reçus en Realtime.
    expect(source).toContain("}, [chatId]);");
  });
});
