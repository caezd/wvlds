import { describe, it, expect, vi, afterEach } from "vitest";
import { parseChatBlock, rollDice } from "@/lib/chat-blocks";

describe("parseChatBlock", () => {
  it("retourne null si le contenu ne commence pas par {", () => {
    expect(parseChatBlock("bonjour")).toBeNull();
    expect(parseChatBlock("")).toBeNull();
  });

  it("retourne null pour du JSON invalide", () => {
    expect(parseChatBlock("{pas du json")).toBeNull();
  });

  it("retourne null pour un JSON valide mais sans _type connu", () => {
    expect(parseChatBlock('{"_type":"inconnu"}')).toBeNull();
    expect(parseChatBlock('{"foo":"bar"}')).toBeNull();
  });

  it("parse un bloc dé valide", () => {
    const block = parseChatBlock('{"_type":"dice","formula":"1d6","results":[4],"modifier":0,"total":4}');
    expect(block).toMatchObject({ _type: "dice", total: 4 });
  });

  it.each(["banner", "reveal", "npc", "hp", "callout"])(
    "reconnaît le type de bloc %s",
    (type) => {
      expect(parseChatBlock(`{"_type":"${type}"}`)).toMatchObject({ _type: type });
    },
  );
});

describe("rollDice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejette une formule invalide", () => {
    expect(() => rollDice("abc")).toThrow(/invalide/i);
    expect(() => rollDice("d6")).toThrow();
    expect(() => rollDice("2x6")).toThrow();
  });

  it("calcule le total avec un modificateur positif", () => {
    // Math.random = 0 → chaque dé vaut floor(0*faces)+1 = 1
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = rollDice("2d6+3");
    expect(res.results).toEqual([1, 1]);
    expect(res.modifier).toBe(3);
    expect(res.total).toBe(5); // 1 + 1 + 3
    expect(res.formula).toBe("2d6+3");
  });

  it("gère un modificateur négatif", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const res = rollDice("1d20-2");
    expect(res.results).toEqual([20]);
    expect(res.total).toBe(18);
  });

  it("accepte la notation majuscule D", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollDice("3D4").results).toEqual([1, 1, 1]);
  });

  it("plafonne le nombre de dés à 100 et les faces à 1000", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollDice("999d9999").results).toHaveLength(100);
  });
});
