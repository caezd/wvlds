import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateRoomKey, encryptMessage, decryptMessage, __clearKeyCache } from "@/lib/crypto";

describe("crypto (AES-256-GCM)", () => {
  it("chiffre puis déchiffre un message (round-trip)", async () => {
    const key = await generateRoomKey();
    const plaintext = "Message secret avec accents éàü 🎲";
    const encrypted = await encryptMessage(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith("enc:")).toBe(true);
    const decrypted = await decryptMessage(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("génère un IV aléatoire : deux chiffrements diffèrent", async () => {
    const key = await generateRoomKey();
    const a = await encryptMessage("identique", key);
    const b = await encryptMessage("identique", key);
    expect(a).not.toBe(b);
  });

  it("laisse passer le texte legacy non préfixé tel quel", async () => {
    const key = await generateRoomKey();
    expect(await decryptMessage("ancien message en clair", key)).toBe(
      "ancien message en clair",
    );
  });

  it("retourne le contenu chiffré inchangé si la clé est mauvaise (pas de crash)", async () => {
    const key = await generateRoomKey();
    const wrongKey = await generateRoomKey();
    const encrypted = await encryptMessage("hello", key);
    // Mauvaise clé → la décryption échoue → on retourne le contenu brut, sans throw
    const out = await decryptMessage(encrypted, wrongKey);
    expect(out).toBe(encrypted);
  });

  it("génère des clés base64 distinctes", async () => {
    const k1 = await generateRoomKey();
    const k2 = await generateRoomKey();
    expect(k1).not.toBe(k2);
    expect(k1.length).toBeGreaterThan(0);
  });
});

// ── Cache des clés importées ─────────────────────────────────────────────────
//
// `importAesKey` partait à chaque message : 50 appels `subtle.importKey` pour
// afficher un salon, bien plus pendant le scan progressif du centre de
// recherche. Ces tests verrouillent la réutilisation ET l'absence de régression
// fonctionnelle (une clé mal cachée déchiffrerait avec le mauvais secret).

describe("crypto — cache des clés importées", () => {
  beforeEach(() => __clearKeyCache());
  afterEach(() => {
    vi.restoreAllMocks();
    __clearKeyCache();
  });

  it("n'importe la clé qu'une fois pour N déchiffrements", async () => {
    const key = await generateRoomKey();
    const messages = await Promise.all(
      Array.from({ length: 20 }, (_, i) => encryptMessage(`msg ${i}`, key)),
    );
    __clearKeyCache();

    const importSpy = vi.spyOn(globalThis.crypto.subtle, "importKey");
    const decrypted: string[] = [];
    for (const m of messages) decrypted.push(await decryptMessage(m, key));

    expect(importSpy).toHaveBeenCalledTimes(1);
    expect(decrypted).toEqual(messages.map((_, i) => `msg ${i}`));
  });

  it("partage un seul import entre déchiffrements concurrents", async () => {
    const key = await generateRoomKey();
    const messages = await Promise.all(
      Array.from({ length: 10 }, (_, i) => encryptMessage(`p ${i}`, key)),
    );
    __clearKeyCache();

    const importSpy = vi.spyOn(globalThis.crypto.subtle, "importKey");
    const out = await Promise.all(messages.map((m) => decryptMessage(m, key)));

    expect(importSpy).toHaveBeenCalledTimes(1);
    expect(out).toEqual(messages.map((_, i) => `p ${i}`));
  });

  it("ne mélange pas deux clés distinctes", async () => {
    const keyA = await generateRoomKey();
    const keyB = await generateRoomKey();
    const fromA = await encryptMessage("secret A", keyA);
    const fromB = await encryptMessage("secret B", keyB);

    expect(await decryptMessage(fromA, keyA)).toBe("secret A");
    expect(await decryptMessage(fromB, keyB)).toBe("secret B");
    // Mauvaise clé → le contenu chiffré est renvoyé tel quel (comportement
    // existant de decryptMessage, qui avale l'erreur).
    expect(await decryptMessage(fromA, keyB)).toBe(fromA);
    // Et la clé correcte fonctionne toujours après cet échec.
    expect(await decryptMessage(fromA, keyA)).toBe("secret A");
  });

  it("ne fige pas un import échoué", async () => {
    const key = await generateRoomKey();
    const encrypted = await encryptMessage("après échec", key);
    __clearKeyCache();

    const real = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle);
    const importSpy = vi
      .spyOn(globalThis.crypto.subtle, "importKey")
      .mockRejectedValueOnce(new Error("import indisponible"));

    // Premier essai : l'import échoue, decryptMessage renvoie le contenu brut.
    expect(await decryptMessage(encrypted, key)).toBe(encrypted);

    // L'échec ne doit pas rester en cache : le suivant réessaie et réussit.
    importSpy.mockImplementation(real as typeof globalThis.crypto.subtle.importKey);
    expect(await decryptMessage(encrypted, key)).toBe("après échec");
  });
});
