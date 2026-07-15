import { describe, it, expect } from "vitest";
import {
  computeWebhookSignature,
  verifyWebhookSignature,
} from "@/lib/patreon/signature";

const SECRET = "whsec_test_123";
const BODY = JSON.stringify({ data: { type: "member", id: "42" } });

describe("verifyWebhookSignature", () => {
  it("accepte une signature valide", () => {
    const sig = computeWebhookSignature(BODY, SECRET);
    expect(verifyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });

  it("rejette une signature calculée avec un mauvais secret", () => {
    const sig = computeWebhookSignature(BODY, "mauvais_secret");
    expect(verifyWebhookSignature(BODY, sig, SECRET)).toBe(false);
  });

  it("rejette un corps altéré", () => {
    const sig = computeWebhookSignature(BODY, SECRET);
    expect(verifyWebhookSignature(BODY + " ", sig, SECRET)).toBe(false);
  });

  it("rejette une signature absente", () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, "", SECRET)).toBe(false);
  });

  it("rejette une signature de longueur différente", () => {
    expect(verifyWebhookSignature(BODY, "abc", SECRET)).toBe(false);
  });

  it("produit un digest HMAC-MD5 hex de 32 caractères", () => {
    expect(computeWebhookSignature(BODY, SECRET)).toMatch(/^[a-f0-9]{32}$/);
  });
});
