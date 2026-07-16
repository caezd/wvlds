import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPatreonMinCents } from "@/lib/patreon/config";

describe("getPatreonMinCents", () => {
  const original = process.env.PATREON_MIN_CENTS;
  afterEach(() => {
    if (original === undefined) delete process.env.PATREON_MIN_CENTS;
    else process.env.PATREON_MIN_CENTS = original;
  });

  it("parse une valeur numérique valide", () => {
    process.env.PATREON_MIN_CENTS = "499";
    expect(getPatreonMinCents()).toBe(499);
  });

  it("retombe sur 0 si la variable est absente", () => {
    delete process.env.PATREON_MIN_CENTS;
    expect(getPatreonMinCents()).toBe(0);
  });

  it("retombe sur 0 (pas NaN) si la variable est malformée", () => {
    process.env.PATREON_MIN_CENTS = "abc";
    expect(getPatreonMinCents()).toBe(0);
    expect(Number.isNaN(getPatreonMinCents())).toBe(false);
  });
});
