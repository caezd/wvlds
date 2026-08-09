import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push";

describe("urlBase64ToUint8Array", () => {
  it("décode une chaîne base64url standard", () => {
    // "hello" en base64url
    const bytes = urlBase64ToUint8Array("aGVsbG8=");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("gère les caractères -/_ propres au base64url", () => {
    // octets [251, 255, 191] -> base64 standard "-/-/" contient +/, base64url remplace par -_
    const bytes = urlBase64ToUint8Array("-_-_");
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("gère une chaîne sans padding requis", () => {
    const bytes = urlBase64ToUint8Array("YQ");
    expect(Array.from(bytes)).toEqual([97]); // "a"
  });

  it("renvoie un tableau vide pour une chaîne vide", () => {
    expect(urlBase64ToUint8Array("").length).toBe(0);
  });
});
