import { describe, it, expect } from "vitest";
import {
  computeWordCount,
  extractMentions,
  buildVisibleToLabels,
  buildMessageMetadata,
  shouldApplyContentWarnings,
} from "@/lib/composerMessage";

describe("computeWordCount", () => {
  it("compte les mots d'un texte simple", () => {
    expect(computeWordCount("Bonjour tout le monde")).toBe(4);
  });

  it("ignore les espaces multiples et les bords", () => {
    expect(computeWordCount("  un   deux  ")).toBe(2);
  });

  it("retourne 0 pour un bloc structuré (JSON _type)", () => {
    expect(computeWordCount('{"_type":"dice","total":4}')).toBe(0);
  });

  it("retourne 0 pour une chaîne vide", () => {
    expect(computeWordCount("   ")).toBe(0);
  });
});

describe("shouldApplyContentWarnings", () => {
  it("est vrai pour un message texte normal", () => {
    expect(shouldApplyContentWarnings("Un message tout à fait normal.")).toBe(true);
  });

  it("est faux pour un bloc structuré (dé, bannière, PNJ…)", () => {
    expect(shouldApplyContentWarnings('{"_type":"dice","total":4}')).toBe(false);
    expect(shouldApplyContentWarnings('{"_type":"banner","url":"https://x"}')).toBe(false);
  });

  it("est vrai pour une chaîne qui ressemble à du JSON mais n'est pas un bloc connu", () => {
    expect(shouldApplyContentWarnings('{"_type":"inconnu"}')).toBe(true);
  });
});

describe("extractMentions", () => {
  it("extrait les pseudos mentionnés", () => {
    expect(extractMentions("salut @alice et @bob_42 !")).toEqual(["alice", "bob_42"]);
  });

  it("retourne un tableau vide sans mention", () => {
    expect(extractMentions("aucune mention ici")).toEqual([]);
  });

  it("s'arrête au premier caractère non autorisé (tiret, accent)", () => {
    expect(extractMentions("coucou @marie-claire")).toEqual(["marie"]);
    expect(extractMentions("@—pas une mention")).toEqual([]);
  });
});

describe("buildVisibleToLabels", () => {
  const participants = [
    { id: "a", username: "alice" },
    { id: "b", username: null },
  ];

  it("retourne null si la note privée est inactive", () => {
    expect(buildVisibleToLabels(null, participants)).toBeNull();
  });

  it("mappe les ids vers des libellés @pseudo", () => {
    expect(buildVisibleToLabels(["a"], participants)).toEqual(["@alice"]);
  });

  it("ignore les participants sans pseudo et les ids inconnus", () => {
    expect(buildVisibleToLabels(["a", "b", "zzz"], participants)).toEqual(["@alice"]);
  });
});

describe("buildMessageMetadata", () => {
  const base = {
    wordCount: 0,
    bubbleMode: false,
    bubbleColor: null,
    smsMode: false,
    media: [],
    visibleToLabels: null,
  };

  it("retourne null quand aucune métadonnée n'est active", () => {
    expect(buildMessageMetadata(base)).toBeNull();
  });

  it("inclut word_count seulement s'il est > 0", () => {
    expect(buildMessageMetadata({ ...base, wordCount: 5 })).toEqual({ word_count: 5 });
  });

  it("inclut bubbles et la couleur quand le mode bulle est actif", () => {
    expect(buildMessageMetadata({ ...base, bubbleMode: true, bubbleColor: "#fff" })).toEqual({
      bubbles: true,
      bubbleColor: "#fff",
    });
  });

  it("inclut bubbles sans couleur si aucune couleur définie", () => {
    expect(buildMessageMetadata({ ...base, bubbleMode: true })).toEqual({ bubbles: true });
  });

  it("inclut les médias et les destinataires", () => {
    const media = [{ url: "u", name: "n" }];
    expect(
      buildMessageMetadata({ ...base, media, visibleToLabels: ["@alice"] }),
    ).toEqual({ media, visible_to_labels: ["@alice"] });
  });

  it("inclut sms quand le mode SMS est actif", () => {
    expect(buildMessageMetadata({ ...base, smsMode: true })).toEqual({ sms: true });
  });

  it("combine bubbles et sms quand les deux sont actifs", () => {
    expect(
      buildMessageMetadata({ ...base, bubbleMode: true, bubbleColor: "#fff", smsMode: true }),
    ).toEqual({ bubbles: true, bubbleColor: "#fff", sms: true });
  });

  it("combine plusieurs métadonnées", () => {
    expect(
      buildMessageMetadata({
        wordCount: 3,
        bubbleMode: true,
        bubbleColor: null,
        smsMode: false,
        media: [],
        visibleToLabels: [],
      }),
    ).toEqual({ word_count: 3, bubbles: true });
  });

  it("inclut content_warnings quand des étiquettes sont présentes", () => {
    expect(
      buildMessageMetadata({ ...base, contentWarnings: ["violence", "deuil"] }),
    ).toEqual({ content_warnings: ["violence", "deuil"] });
  });

  it("omet content_warnings quand la liste est vide ou absente", () => {
    expect(buildMessageMetadata({ ...base, contentWarnings: [] })).toBeNull();
    expect(buildMessageMetadata({ ...base, contentWarnings: null })).toBeNull();
    expect(buildMessageMetadata(base)).toBeNull();
  });
});
