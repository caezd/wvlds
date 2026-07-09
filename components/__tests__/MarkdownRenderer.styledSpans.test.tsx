import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { MarkdownContent } from "@/components/MarkdownRenderer";

// Régression : react-markdown filtre les URLs via son propre `urlTransform`
// (indépendant du schéma rehype-sanitize) — un oubli sur l'un des deux
// filtres suffit à vider silencieusement les faux hrefs `color:`/
// `underline:` produits par transformStyledSpans (lib/textStyledSpans.ts).
describe("MarkdownContent — spans stylés", () => {
  it("rend [#RRGGBB]...[/] en span coloré", () => {
    const { container } = render(<MarkdownContent content="[#ff0000]rouge[/]" />);
    const span = container.querySelector("span");
    expect(span?.textContent).toBe("rouge");
    expect(span?.getAttribute("style")).toContain("255, 0, 0");
  });

  it("rend ++...++ en span souligné", () => {
    const { container } = render(<MarkdownContent content="++souligne++" />);
    const span = container.querySelector("span.underline");
    expect(span?.textContent).toBe("souligne");
  });

  it("garde le markdown imbriqué à l'intérieur d'un span stylé", () => {
    const { container } = render(<MarkdownContent content="[#00ff00]**gras**[/]" />);
    const strong = container.querySelector("span strong");
    expect(strong?.textContent).toBe("gras");
  });

  it("un vrai lien markdown reste un <a> fonctionnel", () => {
    const { container } = render(<MarkdownContent content="[site](https://example.com)" />);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
  });

  it("un lien markdown tapé à la main avec un href color:/underline: arbitraire ne produit jamais de <a href> réel", () => {
    // urlTransform ne laisse passer que `color:` + hex valide ou `underline:`
    // exact — un `[x](underline:foo)` ou `[x](color:zzz)` tapé directement
    // (hors du marqueur [#hex]…[/] / ++…++) est blanchi par defaultUrlTransform
    // avant même d'atteindre le composant `a`.
    const { container } = render(
      <MarkdownContent content="[x](underline:foo) et [y](color:zzz)" />,
    );
    expect(container.querySelectorAll('a[href^="underline:"]')).toHaveLength(0);
    expect(container.querySelectorAll('a[href^="color:"]')).toHaveLength(0);
  });
});
