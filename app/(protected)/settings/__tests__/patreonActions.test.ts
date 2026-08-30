import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

// ──────────────────────────────────────────────────────────────────────────
// Déliaison d'un compte Patreon.
//
// Une action courte, mais qui rétrograde le plan de quelqu'un : elle mérite
// qu'on vérifie qu'elle refuse une session absente, qu'elle ne laisse pas
// remonter le détail technique d'un échec, et surtout qu'elle ne revalide PAS
// la page quand rien n'a été délié — l'écran afficherait alors « compte non
// lié » alors que le lien tient toujours.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const disconnectPatreon = vi.fn();
vi.mock("@/lib/patreon/sync", () => ({ disconnectPatreon: (id: string) => disconnectPatreon(id) }));

import { disconnectPatreonAccount } from "@/app/(protected)/settings/patreonActions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("disconnectPatreonAccount", () => {
  it("délie le compte de l'utilisateur courant", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, claims: { claims: { sub: "u1" } } }));
    disconnectPatreon.mockResolvedValue(undefined);

    expect(await disconnectPatreonAccount()).toEqual({ success: true });
    expect(disconnectPatreon).toHaveBeenCalledWith("u1");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("refuse sans session, sans rien délier", async () => {
    use(createSupabaseMock({ user: null }));

    expect(await disconnectPatreonAccount()).toEqual({ error: "unauthenticated" });
    expect(disconnectPatreon).not.toHaveBeenCalled();
  });

  it("ne revalide pas quand la déliaison échoue", async () => {
    // Revalider ici afficherait « compte non lié » alors que le lien tient
    // toujours — et la personne croirait son abonnement détaché.
    vi.spyOn(console, "error").mockImplementation(() => {});
    use(createSupabaseMock({ user: { id: "u1" }, claims: { claims: { sub: "u1" } } }));
    disconnectPatreon.mockRejectedValue(new Error("réseau indisponible"));

    expect(await disconnectPatreonAccount()).toEqual({ error: "saveFailed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ne laisse pas remonter le détail de l'échec", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    use(createSupabaseMock({ user: { id: "u1" }, claims: { claims: { sub: "u1" } } }));
    disconnectPatreon.mockRejectedValue(
      new Error('permission denied for table "patreon_accounts"'),
    );

    const res = await disconnectPatreonAccount();
    expect(JSON.stringify(res)).not.toContain("patreon_accounts");
  });

  it("journalise le détail côté serveur", async () => {
    // Il doit rester quelque part : c'est le seul moyen de diagnostiquer.
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    use(createSupabaseMock({ user: { id: "u1" }, claims: { claims: { sub: "u1" } } }));
    const cause = new Error("boum");
    disconnectPatreon.mockRejectedValue(cause);

    await disconnectPatreonAccount();
    expect(journal).toHaveBeenCalledWith("Patreon disconnect error:", cause);
  });
});
