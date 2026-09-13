import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadCollapsedCategories, saveCollapsedCategories } from "@/lib/catalogueCollapse";

// jsdom fournit un localStorage partiel — même remplacement que
// lib/__tests__/searchHistory.test.ts.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

beforeEach(() => localStorage.clear());

describe("catalogueCollapse", () => {
  it("est vide par défaut", () => {
    expect(loadCollapsedCategories("w1", "inventory").size).toBe(0);
  });

  it("mémorise par monde et par onglet", () => {
    saveCollapsedCategories("w1", "inventory", new Set(["a", "b"]));
    expect([...loadCollapsedCategories("w1", "inventory")]).toEqual(["a", "b"]);
    expect(loadCollapsedCategories("w1", "skills").size).toBe(0);
    expect(loadCollapsedCategories("w2", "inventory").size).toBe(0);
  });

  it("retire la clé quand plus rien n'est replié", () => {
    saveCollapsedCategories("w1", "inventory", new Set(["a"]));
    saveCollapsedCategories("w1", "inventory", new Set());
    expect(localStorage.getItem("catalogue-collapsed:w1:inventory")).toBeNull();
  });

  it("ignore une valeur corrompue", () => {
    localStorage.setItem("catalogue-collapsed:w1:inventory", "{pas du json");
    expect(loadCollapsedCategories("w1", "inventory").size).toBe(0);
    localStorage.setItem("catalogue-collapsed:w1:inventory", JSON.stringify([1, "ok", null]));
    expect([...loadCollapsedCategories("w1", "inventory")]).toEqual(["ok"]);
  });
});
