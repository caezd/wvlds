// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getPlainText,
  slicesForOffsets,
} from "@/lib/domTextOffsets";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("getPlainText", () => {
  it("concatène les nœuds texte dans l'ordre du document", () => {
    const root = mount("<p>Mara <strong>Kline</strong> observe</p><p> la ville.</p>");
    expect(getPlainText(root)).toBe("Mara Kline observe la ville.");
  });

  it("ignore le texte marqué data-annotate-ignore", () => {
    const root = mount('<p>avant<button data-annotate-ignore>Copier</button>après</p>');
    expect(getPlainText(root)).toBe("avantaprès");
  });

  it("ignore aussi les descendants d'un élément marqué", () => {
    const root = mount('<div data-annotate-ignore><span>bruit</span></div><p>texte</p>');
    expect(getPlainText(root)).toBe("texte");
  });

  it("garde le texte des liens du wiki et des termes du lexique (des <button>)", () => {
    const root = mount('<p>Les <button>Gardiens</button> veillent.</p>');
    expect(getPlainText(root)).toBe("Les Gardiens veillent.");
  });

  it("ignore script et style", () => {
    const root = mount("<style>.a{color:red}</style><p>visible</p><script>var x=1</script>");
    expect(getPlainText(root)).toBe("visible");
  });
});


describe("slicesForOffsets", () => {
  it("découpe la plage nœud par nœud", () => {
    const root = mount("<p>Mara <strong>Kline</strong> observe</p>");
    const slices = slicesForOffsets(root, 3, 12);
    expect(slices.map(s => s.node.nodeValue!.slice(s.start, s.end))).toEqual(["a ", "Kline", " o"]);
  });

  it("renvoie une liste vide sur une plage vide", () => {
    const root = mount("<p>Texte</p>");
    expect(slicesForOffsets(root, 3, 3)).toEqual([]);
  });
});


