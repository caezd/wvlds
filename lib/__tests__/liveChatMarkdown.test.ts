import { describe, it, expect } from "vitest";

import { liveChatPlainText, parseLiveChatMarkdown } from "@/lib/liveChatMarkdown";

const t = (text: string) => ({ type: "text", text });

describe("parseLiveChatMarkdown", () => {
  it("**gras** et *italique*", () => {
    expect(parseLiveChatMarkdown("un **gros** et un *petit* mot")).toEqual([
      t("un "),
      { type: "strong", children: [t("gros")] },
      t(" et un "),
      { type: "em", children: [t("petit")] },
      t(" mot"),
    ]);
  });

  it("de l'italique dans du gras", () => {
    expect(parseLiveChatMarkdown("**très *très* fort**")).toEqual([
      { type: "strong", children: [t("très "), { type: "em", children: [t("très")] }, t(" fort")] },
    ]);
  });

  it("un astérisque seul, ou collé à une espace à l'intérieur, reste tel quel", () => {
    expect(parseLiveChatMarkdown("2 * 3 = 6")).toEqual([t("2 * 3 = 6")]);
    expect(parseLiveChatMarkdown("* pas italique *")).toEqual([t("* pas italique *")]);
    expect(parseLiveChatMarkdown("** pas gras **")).toEqual([t("** pas gras **")]);
    expect(parseLiveChatMarkdown("*ouvert sans fin")).toEqual([t("*ouvert sans fin")]);
    expect(parseLiveChatMarkdown("****")).toEqual([t("****")]);
  });

  it("rien d'autre que le gras et l'italique", () => {
    expect(parseLiveChatMarkdown("# titre [lien](https://x.y) _souligné_ `code`")).toEqual([
      t("# titre [lien](https://x.y) _souligné_ `code`"),
    ]);
  });

  it("un texte vide ne donne rien", () => {
    expect(parseLiveChatMarkdown("")).toEqual([]);
  });
});

describe("liveChatPlainText", () => {
  it("retire les marques, garde le reste", () => {
    expect(liveChatPlainText("**très *très* fort** et 2 * 3")).toBe("très très fort et 2 * 3");
  });
});
