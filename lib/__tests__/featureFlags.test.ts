import { describe, it, expect } from "vitest";
import { getFeatureFlags, DEFAULT_FLAGS, FLAG_KEYS } from "@/lib/featureFlags";
import { createSupabaseMock } from "@/test/supabaseMock";

describe("DEFAULT_FLAGS", () => {
  it("définit une valeur pour chaque clé de FLAG_KEYS", () => {
    for (const key of FLAG_KEYS) {
      expect(DEFAULT_FLAGS).toHaveProperty(key);
      expect(typeof DEFAULT_FLAGS[key]).toBe("boolean");
    }
  });
});

describe("getFeatureFlags", () => {
  it("retourne les valeurs par défaut quand la table est vide", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    const flags = await getFeatureFlags(mock.client as never);
    expect(flags).toEqual(DEFAULT_FLAGS);
  });

  it("écrase les défauts avec les lignes de la base", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [{ key: "shop", enabled: false }, { key: "public_worlds", enabled: true }] }],
    });
    const flags = await getFeatureFlags(mock.client as never);
    expect(flags.shop).toBe(false);
    expect(flags.public_worlds).toBe(true);
    // Les autres restent au défaut
    expect(flags.notifications).toBe(DEFAULT_FLAGS.notifications);
  });

  it("ignore les clés inconnues présentes en base", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [{ key: "cle_fantome", enabled: true }] }],
    });
    const flags = await getFeatureFlags(mock.client as never);
    expect(flags).not.toHaveProperty("cle_fantome");
  });

  it("retourne les défauts si data est null", async () => {
    const mock = createSupabaseMock({ results: [{ data: null }] });
    const flags = await getFeatureFlags(mock.client as never);
    expect(flags).toEqual(DEFAULT_FLAGS);
  });
});
