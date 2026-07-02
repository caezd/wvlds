import { describe, it, expect } from "vitest";
import { buildActiveChallenges, type DailyChallengeRow } from "@/lib/activeChallenges";

function row(overrides: Partial<DailyChallengeRow> = {}): DailyChallengeRow {
  return {
    id: "c1",
    title: "Mot interdit",
    description: "Sans « alors »",
    validation: { kind: "no_word", value: "alors" },
    reward_coins: 15,
    reward_xp: 10,
    min_word_count: 50,
    source: "admin",
    active_date: "2026-07-02",
    challenge_attempts: [],
    ...overrides,
  };
}

describe("buildActiveChallenges", () => {
  it("marque already_won quand une tentative gagnée est embarquée", () => {
    const { challenges, wonIds } = buildActiveChallenges([
      row({ challenge_attempts: [{ challenge_id: "c1" }] }),
    ]);
    expect(challenges[0].already_won).toBe(true);
    expect(wonIds.has("c1")).toBe(true);
  });

  it("ne marque pas already_won sans tentative (tableau vide)", () => {
    const { challenges, wonIds } = buildActiveChallenges([row()]);
    expect(challenges[0].already_won).toBe(false);
    expect(wonIds.size).toBe(0);
  });

  it("tolère un embed absent (null/undefined)", () => {
    const { challenges } = buildActiveChallenges([
      row({ challenge_attempts: null }),
      row({ id: "c2", challenge_attempts: undefined }),
    ]);
    expect(challenges.map((c) => c.already_won)).toEqual([false, false]);
  });

  it("distingue les défis gagnés des autres dans une même liste", () => {
    const { challenges, wonIds } = buildActiveChallenges([
      row({ id: "c1", challenge_attempts: [{ challenge_id: "c1" }] }),
      row({ id: "c2" }),
    ]);
    expect(challenges.find((c) => c.id === "c1")?.already_won).toBe(true);
    expect(challenges.find((c) => c.id === "c2")?.already_won).toBe(false);
    expect([...wonIds]).toEqual(["c1"]);
  });

  it("préserve les champs du défi", () => {
    const { challenges } = buildActiveChallenges([row()]);
    expect(challenges[0]).toMatchObject({
      id: "c1",
      title: "Mot interdit",
      reward_coins: 15,
      reward_xp: 10,
      min_word_count: 50,
      active_date: "2026-07-02",
      source: "admin",
    });
  });
});
