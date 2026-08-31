// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  collectTextNodes,
  getPlainText,
  offsetsFromRange,
  rangeForOffsets,
  slicesForOffsets,
  wrapSlices,
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

describe("offsetsFromRange", () => {
  it("convertit une sélection à cheval sur deux éléments", () => {
    const root = mount("<p>Mara <strong>Kline</strong> observe</p>");
    const nodes = collectTextNodes(root);
    const range = document.createRange();
    range.setStart(nodes[0], 5);          // début de « Kline » côté « Mara  »
    range.setEnd(nodes[2], 8);            // fin de « observe »
    expect(offsetsFromRange(root, range)).toEqual({ start: 5, end: 18 });
    expect(getPlainText(root).slice(5, 18)).toBe("Kline observe");
  });

  it("rabat une sélection posée sur un élément (triple-clic) sur son texte", () => {
    const root = mount("<p>Premier.</p><p>Second.</p>");
    const second = root.querySelectorAll("p")[1];
    const range = document.createRange();
    range.selectNodeContents(second);
    expect(offsetsFromRange(root, range)).toEqual({ start: 8, end: 15 });
  });

  it("renvoie null sur une sélection vide", () => {
    const root = mount("<p>Texte</p>");
    const range = document.createRange();
    range.setStart(collectTextNodes(root)[0], 2);
    range.collapse(true);
    expect(offsetsFromRange(root, range)).toBeNull();
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

describe("rangeForOffsets", () => {
  it("produit une plage dont le texte est celui attendu", () => {
    const root = mount("<p>Mara <strong>Kline</strong> observe</p>");
    expect(rangeForOffsets(root, 5, 10)?.toString()).toBe("Kline");
  });
});

describe("wrapSlices", () => {
  it("enveloppe la portion sélectionnée sans toucher au reste", () => {
    const root = mount("<p>Mara Kline observe</p>");
    const spans = wrapSlices(slicesForOffsets(root, 5, 10), s => { s.className = "mark"; });
    expect(spans).toHaveLength(1);
    expect(spans[0].textContent).toBe("Kline");
    expect(root.querySelector("p")!.textContent).toBe("Mara Kline observe");
    expect(getPlainText(root)).toBe("Mara Kline observe");
  });

  it("enveloppe une portion par élément traversé", () => {
    const root = mount("<p>Mara <strong>Kline</strong> observe</p>");
    const spans = wrapSlices(slicesForOffsets(root, 3, 12), s => { s.className = "mark"; });
    expect(spans.map(s => s.textContent)).toEqual(["a ", "Kline", " o"]);
    expect(getPlainText(root)).toBe("Mara Kline observe");
  });

  it("garde en tête le nœud d'origine quand la portion commence au début", () => {
    const root = mount("<p>Mara Kline</p>");
    const original = collectTextNodes(root)[0];
    wrapSlices(slicesForOffsets(root, 0, 4), s => { s.className = "mark"; });
    // Le nœud que React référence est celui qu'on a enveloppé, pas un clone.
    expect(original.nodeValue).toBe("Mara");
    expect(original.parentElement!.className).toBe("mark");
  });

  it("laisse le nœud d'origine en tête de fratrie quand la portion est au milieu", () => {
    const root = mount("<p>Mara Kline</p>");
    const original = collectTextNodes(root)[0];
    wrapSlices(slicesForOffsets(root, 5, 10), s => { s.className = "mark"; });
    expect(original.nodeValue).toBe("Mara ");
    expect(original.parentElement!.tagName).toBe("P");
    expect(original.parentElement!.firstChild).toBe(original);
  });
});
