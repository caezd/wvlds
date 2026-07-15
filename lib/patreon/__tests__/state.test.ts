import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signState, verifyState } from "@/lib/patreon/state";

// signState/verifyState lisent le client secret via getPatreonConfig().
beforeEach(() => {
  process.env.PATREON_CLIENT_ID = "cid";
  process.env.PATREON_CLIENT_SECRET = "sekret-de-test";
  process.env.PATREON_CAMPAIGN_ID = "9055832";
  process.env.PATREON_WEBHOOK_SECRET = "whsec";
});
afterEach(() => vi.useRealTimers());

describe("signState / verifyState", () => {
  it("un state signé se vérifie et rend l'userId", () => {
    const state = signState("user-42");
    expect(verifyState(state)).toEqual({ userId: "user-42" });
  });

  it("rejette une signature altérée", () => {
    const state = signState("user-42");
    const tampered = state.slice(0, -2) + (state.endsWith("aa") ? "bb" : "aa");
    expect(verifyState(tampered)).toBeNull();
  });

  it("rejette un payload modifié (uid changé) car la signature ne colle plus", () => {
    const [, sig] = signState("user-42").split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ uid: "attacker", iat: Date.now(), n: "x" }),
      "utf8",
    ).toString("base64url");
    expect(verifyState(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejette un state expiré (> 10 min)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    const state = signState("user-42");
    vi.setSystemTime(new Date("2026-07-15T00:11:00Z")); // +11 min
    expect(verifyState(state)).toBeNull();
  });

  it("rejette null / vide / format cassé", () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState("")).toBeNull();
    expect(verifyState("pasdepoint")).toBeNull();
  });
});
