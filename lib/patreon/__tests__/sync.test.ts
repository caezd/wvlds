import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const { adminMock, refreshAccessTokenMock, fetchMembershipMock } = vi.hoisted(() => ({
  adminMock: { client: null as unknown },
  refreshAccessTokenMock: vi.fn(),
  fetchMembershipMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminMock.client,
}));
vi.mock("../config", () => ({
  getPatreonConfig: () => ({ minCents: 499 }),
}));
vi.mock("../client", () => ({
  refreshAccessToken: refreshAccessTokenMock,
  fetchMembership: fetchMembershipMock,
}));

import {
  syncPatreonEntitlement,
  disconnectPatreon,
  resyncStalePatreonAccounts,
} from "../sync";

function useAdmin(results: import("@/test/supabaseMock").QueryResult[]) {
  const mock = createSupabaseMock({ results });
  adminMock.client = mock.client;
  return mock;
}

const membership = { patreonUserId: "pt-1", patronStatus: "active_patron" as const, entitledCents: 500 };
const tokens = {
  accessToken: "acc-new",
  refreshToken: "ref-new",
  expiresAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("syncPatreonEntitlement", () => {
  it("chemin callback OAuth (tokens fournis, premier lien) : upsert + update sans erreur", async () => {
    useAdmin([
      { data: null }, // existing (patreon_accounts lookup) -> aucun conflit
      { data: { plan: "free" } }, // profiles.select plan
      { error: null }, // patreon_accounts upsert
      { error: null }, // profiles update
    ]);
    const res = await syncPatreonEntitlement({ userId: "u1", membership, tokens });
    expect(res).toEqual({ plan: "subscribed" });
  });

  it("chemin webhook (pas de tokens, compte déjà lié) : reporte les tokens existants dans l'upsert", async () => {
    const mock = useAdmin([
      {
        data: {
          user_id: "u1",
          access_token: "acc-existing",
          refresh_token: "ref-existing",
          token_expires_at: "2026-07-01T00:00:00.000Z",
        },
      }, // existing -> compte déjà lié, avec ses tokens
      { data: { plan: "free" } },
      { error: null },
      { error: null },
    ]);
    const res = await syncPatreonEntitlement({ userId: "u1", membership });
    expect(res).toEqual({ plan: "subscribed" });

    // Régression du bug : l'upsert doit reporter les tokens existants
    // (access_token/refresh_token sont NOT NULL en base) au lieu de les omettre.
    const upsertBuilder = mock.buildersFor("patreon_accounts")[1];
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "acc-existing",
        refresh_token: "ref-existing",
        token_expires_at: "2026-07-01T00:00:00.000Z",
      }),
      expect.anything(),
    );
  });

  it("lève si aucun token n'est disponible (ni fourni, ni en base) — ne devrait jamais arriver en pratique", async () => {
    useAdmin([{ data: null }]);
    await expect(syncPatreonEntitlement({ userId: "u1", membership })).rejects.toThrow(/aucun token/i);
  });

  it("lève si la lecture du profil échoue (ne doit pas traiter le plan comme null silencieusement)", async () => {
    useAdmin([
      { data: null },
      { data: null, error: { message: "boom" } },
    ]);
    await expect(syncPatreonEntitlement({ userId: "u1", membership, tokens })).rejects.toThrow(/profil/i);
  });

  it("lève si l'upsert patreon_accounts échoue", async () => {
    useAdmin([
      { data: null },
      { data: { plan: "free" } },
      { error: { message: "upsert failed" } },
    ]);
    await expect(syncPatreonEntitlement({ userId: "u1", membership, tokens })).rejects.toThrow(/lien Patreon/i);
  });

  it("lève si l'update de profiles.plan échoue", async () => {
    useAdmin([
      { data: null },
      { data: { plan: "free" } },
      { error: null },
      { error: { message: "update failed" } },
    ]);
    await expect(syncPatreonEntitlement({ userId: "u1", membership, tokens })).rejects.toThrow(/mise à jour du plan/i);
  });
});

describe("disconnectPatreon", () => {
  it("chemin nominal : delete + select + update sans erreur", async () => {
    useAdmin([
      { error: null }, // delete patreon_accounts
      { data: { plan: "free" } }, // select profile
      { error: null }, // update profile
    ]);
    await expect(disconnectPatreon("u1")).resolves.toBeUndefined();
  });

  it("lève si la suppression échoue", async () => {
    useAdmin([{ error: { message: "delete failed" } }]);
    await expect(disconnectPatreon("u1")).rejects.toThrow(/suppression/i);
  });

  it("lève si la lecture du profil échoue", async () => {
    useAdmin([
      { error: null },
      { data: null, error: { message: "boom" } },
    ]);
    await expect(disconnectPatreon("u1")).rejects.toThrow(/profil/i);
  });

  it("lève si la mise à jour du profil échoue", async () => {
    useAdmin([
      { error: null },
      { data: { plan: "free" } },
      { error: { message: "update failed" } },
    ]);
    await expect(disconnectPatreon("u1")).rejects.toThrow(/mise à jour du plan/i);
  });
});

describe("resyncStalePatreonAccounts", () => {
  beforeEach(() => {
    refreshAccessTokenMock.mockReset();
    fetchMembershipMock.mockReset();
  });

  it("lève si la liste des comptes ne peut pas être lue (ne renvoie pas processed:0 comme si tout allait bien)", async () => {
    useAdmin([{ data: null, error: { message: "select failed" } }]);
    await expect(resyncStalePatreonAccounts()).rejects.toThrow(/lister les comptes/i);
  });

  it("isole les échecs par compte : un compte en erreur ne bloque pas les autres", async () => {
    useAdmin([
      { data: [
        { user_id: "u1", refresh_token: "r1" },
        { user_id: "u2", refresh_token: "r2" },
      ] },
    ]);
    refreshAccessTokenMock
      .mockRejectedValueOnce(new Error("token revoked"))
      .mockResolvedValueOnce({ accessToken: "a2", refreshToken: "r2b", expiresAt: new Date() });
    fetchMembershipMock.mockResolvedValue(membership);

    // syncPatreonEntitlement est appelée en interne pour le compte u2 : on lui
    // fournit les résultats nécessaires (existing lookup, profile, upsert, update).
    const mock = createSupabaseMock({
      results: [
        { data: [
          { user_id: "u1", refresh_token: "r1" },
          { user_id: "u2", refresh_token: "r2" },
        ] },
        { data: null },
        { data: { plan: "free" } },
        { error: null },
        { error: null },
      ],
    });
    adminMock.client = mock.client;

    const result = await resyncStalePatreonAccounts();
    expect(result).toEqual({ processed: 1, errors: 1 });
  });
});
