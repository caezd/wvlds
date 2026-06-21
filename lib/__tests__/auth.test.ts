import { describe, it, expect, vi } from "vitest";
import { getUserId } from "@/lib/auth";

function clientWithClaims(claims: unknown) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: claims }),
    },
  } as unknown as Parameters<typeof getUserId>[0];
}

describe("getUserId", () => {
  it("retourne le `sub` des claims quand l'utilisateur est authentifié", async () => {
    const client = clientWithClaims({ claims: { sub: "user-123" } });
    await expect(getUserId(client)).resolves.toBe("user-123");
  });

  it("retourne null quand getClaims ne renvoie pas de claims", async () => {
    const client = clientWithClaims(null);
    await expect(getUserId(client)).resolves.toBeNull();
  });

  it("retourne null quand les claims n'ont pas de `sub`", async () => {
    const client = clientWithClaims({ claims: { email: "a@b.c" } });
    await expect(getUserId(client)).resolves.toBeNull();
  });

  it("n'appelle jamais getUser (pas d'aller-retour réseau)", async () => {
    const getUser = vi.fn();
    const client = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "u" } } }),
        getUser,
      },
    } as unknown as Parameters<typeof getUserId>[0];

    await getUserId(client);
    expect(getUser).not.toHaveBeenCalled();
  });
});
