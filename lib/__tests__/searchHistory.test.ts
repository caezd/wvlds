import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSearchHistory, addSearchHistoryEntry, clearSearchHistory } from "@/lib/searchHistory";

// jsdom fournit un localStorage partiel (pas de .clear()) — remplacé par une
// implémentation complète basée sur un objet JS (même pattern que
// components/__tests__/ChatroomComposerDraft.test.tsx).
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

beforeEach(() => {
  localStorage.clear();
});

describe("searchHistory", () => {
  it("est vide par défaut", () => {
    expect(loadSearchHistory("w1")).toEqual([]);
  });

  it("ajoute un terme en tête de liste", () => {
    addSearchHistoryEntry("w1", "jpp");
    const history = addSearchHistoryEntry("w1", "sexe");
    expect(history).toEqual(["sexe", "jpp"]);
  });

  it("déduplique sans tenir compte de la casse, en remontant le terme existant", () => {
    addSearchHistoryEntry("w1", "jpp");
    addSearchHistoryEntry("w1", "sexe");
    const history = addSearchHistoryEntry("w1", "JPP");
    expect(history).toEqual(["JPP", "sexe"]);
  });

  it("ignore un terme vide", () => {
    addSearchHistoryEntry("w1", "jpp");
    const history = addSearchHistoryEntry("w1", "   ");
    expect(history).toEqual(["jpp"]);
  });

  it("plafonne à 8 entrées", () => {
    for (let i = 0; i < 10; i++) addSearchHistoryEntry("w1", `terme${i}`);
    expect(loadSearchHistory("w1")).toHaveLength(8);
    expect(loadSearchHistory("w1")[0]).toBe("terme9");
  });

  it("isole l'historique par monde", () => {
    addSearchHistoryEntry("w1", "jpp");
    addSearchHistoryEntry("w2", "sexe");
    expect(loadSearchHistory("w1")).toEqual(["jpp"]);
    expect(loadSearchHistory("w2")).toEqual(["sexe"]);
  });

  it("efface l'historique d'un monde", () => {
    addSearchHistoryEntry("w1", "jpp");
    clearSearchHistory("w1");
    expect(loadSearchHistory("w1")).toEqual([]);
  });
});
