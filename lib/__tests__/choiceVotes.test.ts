import { describe, it, expect } from "vitest";
import { aggregateChoiceVotes, applyOwnVote, applyRemoteVoteChange } from "@/lib/choiceVotes";

describe("aggregateChoiceVotes", () => {
  it("retourne un tableau vide sans lignes", () => {
    expect(aggregateChoiceVotes([], "viewer")).toEqual([]);
  });

  it("compte les votes par option", () => {
    const rows = [
      { option_id: "a", user_id: "u1" },
      { option_id: "a", user_id: "u2" },
      { option_id: "b", user_id: "u3" },
    ];
    const result = aggregateChoiceVotes(rows, "u4");
    expect(result).toEqual(
      expect.arrayContaining([
        { option_id: "a", count: 2, mine: false },
        { option_id: "b", count: 1, mine: false },
      ]),
    );
  });

  it("marque l'option votée par le spectateur courant", () => {
    const rows = [
      { option_id: "a", user_id: "u1" },
      { option_id: "b", user_id: "viewer" },
    ];
    const result = aggregateChoiceVotes(rows, "viewer");
    expect(result.find((v) => v.option_id === "b")).toEqual({ option_id: "b", count: 1, mine: true });
    expect(result.find((v) => v.option_id === "a")).toEqual({ option_id: "a", count: 1, mine: false });
  });

  it("ne marque rien mine quand viewerId est null", () => {
    const rows = [{ option_id: "a", user_id: "u1" }];
    expect(aggregateChoiceVotes(rows, null)).toEqual([{ option_id: "a", count: 1, mine: false }]);
  });
});

describe("applyOwnVote", () => {
  it("ajoute un premier vote", () => {
    expect(applyOwnVote([], "a")).toEqual([{ option_id: "a", count: 1, mine: true }]);
  });

  it("déplace le vote précédent de l'utilisateur vers la nouvelle option", () => {
    const current = [
      { option_id: "a", count: 1, mine: true },
      { option_id: "b", count: 2, mine: false },
    ];
    const next = applyOwnVote(current, "b");
    expect(next).toEqual(
      expect.arrayContaining([
        { option_id: "b", count: 3, mine: true },
      ]),
    );
    expect(next.find((v) => v.option_id === "a")).toBeUndefined();
  });

  it("ne change rien si l'utilisateur revote la même option", () => {
    const current = [{ option_id: "a", count: 1, mine: true }];
    expect(applyOwnVote(current, "a")).toBe(current);
  });

  it("retire l'ancienne option du résultat si son compte tombe à zéro", () => {
    const current = [{ option_id: "a", count: 1, mine: true }];
    const next = applyOwnVote(current, "b");
    expect(next).toEqual([{ option_id: "b", count: 1, mine: true }]);
  });
});

describe("applyRemoteVoteChange", () => {
  it("insertion : incrémente la nouvelle option", () => {
    const next = applyRemoteVoteChange([], null, "a");
    expect(next).toEqual([{ option_id: "a", count: 1, mine: false }]);
  });

  it("suppression : décrémente et retire l'option si elle tombe à zéro", () => {
    const current = [{ option_id: "a", count: 1, mine: false }];
    expect(applyRemoteVoteChange(current, "a", null)).toEqual([]);
  });

  it("revote (update) : déplace le compte de l'ancienne vers la nouvelle option", () => {
    const current = [
      { option_id: "a", count: 2, mine: false },
      { option_id: "b", count: 1, mine: false },
    ];
    const next = applyRemoteVoteChange(current, "a", "b");
    expect(next).toEqual(
      expect.arrayContaining([
        { option_id: "a", count: 1, mine: false },
        { option_id: "b", count: 2, mine: false },
      ]),
    );
  });

  it("préserve le flag mine de l'option qui gagne un vote tiers", () => {
    const current = [{ option_id: "a", count: 1, mine: true }];
    expect(applyRemoteVoteChange(current, null, "a")).toEqual([{ option_id: "a", count: 2, mine: true }]);
  });
});
