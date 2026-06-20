import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// hasEnvVars est évalué à l'import depuis les variables d'env ; on le force à true.
vi.mock("@/lib/utils", () => ({ hasEnvVars: true }));

// On simule @supabase/ssr : getClaims() déclenche un rafraîchissement de session
// (Supabase réécrit des cookies d'auth via setAll), comme en prod quand le token
// d'accès est proche de l'expiration.
let claims: { sub: string } | null = { sub: "u1" };
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (c: { name: string; value: string; options?: object }[]) => void };
  }) => ({
    auth: {
      getClaims: async () => {
        options.cookies.setAll([
          { name: "sb-access-token", value: "REFRESHED", options: { path: "/" } },
        ]);
        return { data: claims ? { claims } : null };
      },
    },
  }),
}));

import { updateSession } from "@/lib/supabase/middleware";

beforeEach(() => {
  claims = { sub: "u1" };
});

describe("updateSession — préservation de la session", () => {
  it("sur /w/<id> : pose last_world_id ET conserve le cookie de session rafraîchi", async () => {
    const req = new NextRequest("http://localhost:3000/w/abc123");
    const res = await updateSession(req);

    // Régression : l'ancienne version renvoyait un NextResponse.next() neuf qui
    // jetait le cookie de session → 404 sur les mondes. On vérifie qu'il survit.
    expect(res.cookies.get("sb-access-token")?.value).toBe("REFRESHED");
    expect(res.cookies.get("last_world_id")?.value).toBe("abc123");
  });

  it("sur une route normale : conserve le cookie de session rafraîchi", async () => {
    const req = new NextRequest("http://localhost:3000/home");
    const res = await updateSession(req);
    expect(res.cookies.get("sb-access-token")?.value).toBe("REFRESHED");
  });

  it("redirige vers /auth/login si non authentifié", async () => {
    claims = null;
    const req = new NextRequest("http://localhost:3000/w/abc123");
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
  });
});
