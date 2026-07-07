import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Variables hoistées (accessibles dans les factories vi.mock) ───────────────

const { mockRedirect, mockCookiesGet, mockGetClaims, mockFrom } = vi.hoisted(() => ({
  // next/navigation `redirect()` throw une erreur spéciale en prod pour court-circuiter
  // le rendu — on reproduit ce comportement pour que les assertions s'arrêtent au bon endroit.
  mockRedirect: vi.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  }),
  mockCookiesGet: vi.fn(),
  mockGetClaims: vi.fn(),
  mockFrom: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mockCookiesGet }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mockGetClaims },
    from: mockFrom,
  }),
}));

import Home from "@/app/page";

// ── Helper ────────────────────────────────────────────────────────────────────

type ChainData = { id: string } | null;

function makeChain(maybeSingleData: ChainData, singleData: ChainData = null) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = vi.fn(ret);
  chain.eq = vi.fn(ret);
  chain.is = vi.fn(ret);
  chain.limit = vi.fn(ret);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: maybeSingleData });
  chain.single = vi.fn().mockResolvedValue({ data: singleData });
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
});

// redirect() throw — chaque appel Home() doit être wrappé dans un try/catch
async function runHome() {
  try { await Home(); } catch { /* NEXT_REDIRECT attendu */ }
}

describe("Home — redirection vers last_world_id", () => {
  it("redirige directement si l'utilisateur a accès au dernier monde", async () => {
    mockCookiesGet.mockImplementation((k: string) =>
      k === "last_world_id" ? { value: "world-A" } : undefined,
    );
    mockFrom.mockReturnValue(makeChain({ id: "world-A" }));

    await runHome();

    expect(mockRedirect).toHaveBeenCalledWith("/w/world-A");
    // redirect() throw après la vérification d'accès : le fallback ne tourne pas
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("ignore last_world_id et utilise le fallback si l'utilisateur n'y a pas accès", async () => {
    mockCookiesGet.mockImplementation((k: string) =>
      k === "last_world_id" ? { value: "world-autre-compte" } : undefined,
    );

    let call = 0;
    mockFrom.mockImplementation(() => {
      // 1er appel : vérification d'accès → RLS bloque, retourne null
      // 2e appel  : fallback → premier monde accessible du compte courant
      return call++ === 0
        ? makeChain(null)
        : makeChain(null, { id: "world-B" });
    });

    await runHome();

    expect(mockRedirect).not.toHaveBeenCalledWith("/w/world-autre-compte");
    expect(mockRedirect).toHaveBeenCalledWith("/w/world-B");
  });

  it("redirige vers /explore si aucun monde accessible et pas de cookie", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    mockFrom.mockReturnValue(makeChain(null, null));

    await runHome();

    expect(mockRedirect).toHaveBeenCalledWith("/explore");
    expect(mockRedirect).not.toHaveBeenCalledWith(expect.stringMatching(/^\/w\//));
  });

  it("redirige vers /auth/login si non authentifié", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });
    mockCookiesGet.mockReturnValue(undefined);

    await runHome();

    expect(mockRedirect).toHaveBeenCalledWith("/auth/login");
  });
});
