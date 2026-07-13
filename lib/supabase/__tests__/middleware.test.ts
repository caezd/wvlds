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

describe("updateSession — cookie last_world_id", () => {
  it("efface last_world_id quand l'utilisateur n'est pas authentifié", async () => {
    claims = null;
    const req = new NextRequest("http://localhost:3000/w/abc123");
    req.cookies.set("last_world_id", "abc123");
    const res = await updateSession(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
    // Cookie doit être expiré (valeur vide et/ou maxAge 0)
    const cleared = res.cookies.get("last_world_id");
    expect(cleared?.value ?? "").toBe("");
  });

  it("conserve last_world_id quand l'utilisateur est authentifié (pas de suppression prématurée)", async () => {
    const req = new NextRequest("http://localhost:3000/home");
    req.cookies.set("last_world_id", "abc123");
    const res = await updateSession(req);

    // Pas de redirection vers login — le cookie ne doit pas avoir été effacé
    expect(res.status).not.toBe(307);
    expect(res.cookies.get("last_world_id")?.value ?? "abc123").toBe("abc123");
  });
});

describe("updateSession — index /w", () => {
  it("redirige /w vers / (la page d'accueil choisit le monde selon l'appartenance)", async () => {
    const req = new NextRequest("http://localhost:3000/w");
    req.cookies.set("last_world_id", "abc123");
    const res = await updateSession(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(new URL(location).pathname).toBe("/");
    // Ne redirige plus aveuglément vers /w/<last_world_id> (monde peut-être quitté).
    expect(location).not.toContain("/w/abc123");
    // Cookie de session rafraîchi préservé.
    expect(res.cookies.get("sb-access-token")?.value).toBe("REFRESHED");
  });

  it("redirige /w vers / même sans cookie last_world_id", async () => {
    const req = new NextRequest("http://localhost:3000/w");
    const res = await updateSession(req);

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
  });
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
