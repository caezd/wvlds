import { describe, it, expect, vi, afterEach } from "vitest";
import { parseIdentity, parseTokenResponse } from "@/lib/patreon/client";

const CAMPAIGN = "9055832";

describe("parseTokenResponse", () => {
  afterEach(() => vi.useRealTimers());

  it("mappe les tokens et calcule expiresAt depuis expires_in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const tokens = parseTokenResponse({
      access_token: "acc",
      refresh_token: "ref",
      expires_in: 3600,
    });
    expect(tokens.accessToken).toBe("acc");
    expect(tokens.refreshToken).toBe("ref");
    expect(tokens.expiresAt.toISOString()).toBe("2026-07-15T01:00:00.000Z");
  });

  it("lève si un token manque", () => {
    expect(() => parseTokenResponse({ access_token: "acc" })).toThrow();
  });
});

describe("parseIdentity", () => {
  it("extrait le mécénat actif sur NOTRE campagne", () => {
    const json = {
      data: { id: "user-1" },
      included: [
        {
          type: "member",
          attributes: { patron_status: "active_patron", currently_entitled_amount_cents: 500 },
          relationships: { campaign: { data: { id: CAMPAIGN } } },
        },
      ],
    };
    expect(parseIdentity(json, CAMPAIGN)).toEqual({
      patreonUserId: "user-1",
      patronStatus: "active_patron",
      entitledCents: 500,
    });
  });

  it("ignore les mécénats d'AUTRES campagnes", () => {
    const json = {
      data: { id: "user-1" },
      included: [
        {
          type: "member",
          attributes: { patron_status: "active_patron", currently_entitled_amount_cents: 999 },
          relationships: { campaign: { data: { id: "autre-campagne" } } },
        },
      ],
    };
    expect(parseIdentity(json, CAMPAIGN)).toEqual({
      patreonUserId: "user-1",
      patronStatus: null,
      entitledCents: 0,
    });
  });

  it("renvoie statut null / 0 cents si aucun mécénat (utilisateur juste lié)", () => {
    const json = { data: { id: "user-1" }, included: [] };
    expect(parseIdentity(json, CAMPAIGN)).toEqual({
      patreonUserId: "user-1",
      patronStatus: null,
      entitledCents: 0,
    });
  });

  it("normalise un patron_status inconnu en null", () => {
    const json = {
      data: { id: "user-1" },
      included: [
        {
          type: "member",
          attributes: { patron_status: "bizarre", currently_entitled_amount_cents: 500 },
          relationships: { campaign: { data: { id: CAMPAIGN } } },
        },
      ],
    };
    expect(parseIdentity(json, CAMPAIGN).patronStatus).toBeNull();
  });

  it("lève si l'id utilisateur est absent", () => {
    expect(() => parseIdentity({ data: {} }, CAMPAIGN)).toThrow();
  });
});
