import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { LIVE_CHAT_OPTION_FIELDS, liveChatOptionsOf, parseLiveChatInput } from "@/lib/worldLiveChatOptions";
import { readableOnPage } from "@/lib/bubbleColors";

describe("parseLiveChatInput", () => {
  it("/me devient une action quand le monde les permet", () => {
    expect(parseLiveChatInput("/me se rend à la porte.", true)).toEqual({ content: "se rend à la porte.", isAction: true });
    expect(parseLiveChatInput("  /ME   salue  ", true)).toEqual({ content: "salue", isAction: true });
  });

  it("sans l'option, le texte part tel quel", () => {
    expect(parseLiveChatInput("/me se lève", false)).toEqual({ content: "/me se lève", isAction: false });
  });

  it("un /me seul, ou collé à un mot, n'est pas une action", () => {
    expect(parseLiveChatInput("/me", true)).toEqual({ content: "/me", isAction: false });
    expect(parseLiveChatInput("/meurtre", true)).toEqual({ content: "/meurtre", isAction: false });
    expect(parseLiveChatInput("bonjour /me", true)).toEqual({ content: "bonjour /me", isAction: false });
  });
});

describe("liveChatOptionsOf", () => {
  it("seul true allume une option", () => {
    expect(liveChatOptionsOf({ live_chat_colors: true, live_chat_bubbles: null })).toEqual({
      colors: true,
      bubbles: false,
      personas: false,
      actions: false,
    });
    expect(liveChatOptionsOf(null)).toEqual({ colors: false, bubbles: false, personas: false, actions: false });
  });

  it("chaque option a sa colonne dans la migration 241, éteinte par défaut", () => {
    const sql = readFileSync(path.join(process.cwd(), "migrations/241_world_live_chat_options.sql"), "utf8");
    for (const field of LIVE_CHAT_OPTION_FIELDS) {
      expect(sql).toMatch(new RegExp(`${field}\\s+boolean NOT NULL DEFAULT false`));
    }
  });
});

describe("readableOnPage", () => {
  it("garde une couleur qui se lit sur le fond sombre", () => {
    expect(readableOnPage("#f87171")).toBe("#f87171");
    expect(readableOnPage("#ffffff")).toBe("#ffffff");
  });

  it("une couleur transparente s'affiche en texte sous sa teinte opaque", () => {
    // L'opacité ne vaut que pour le fond d'une bulle.
    expect(readableOnPage("#4ade804d")).toBe("#4ade80");
    expect(readableOnPage("#ffffff10")).toBe("#ffffff");
  });

  it("écarte une couleur qui disparaîtrait dans le fond", () => {
    expect(readableOnPage("#000000")).toBeUndefined();
    expect(readableOnPage("#1e3a8a")).toBeUndefined();
    expect(readableOnPage("#1e3a8a80")).toBeUndefined();
  });

  it("rien à lire sans couleur valable", () => {
    expect(readableOnPage(null)).toBeUndefined();
    expect(readableOnPage("rouge")).toBeUndefined();
  });
});
