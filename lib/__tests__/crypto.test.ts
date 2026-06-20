import { describe, it, expect } from "vitest";
import { generateRoomKey, encryptMessage, decryptMessage } from "@/lib/crypto";

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
