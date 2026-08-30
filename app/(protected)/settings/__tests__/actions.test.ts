import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

// ──────────────────────────────────────────────────────────────────────────
// Préférence de langue : le cookie et le profil.
//
// Ces deux actions n'avaient aucun test, et elles gouvernent la langue de
// TOUTE l'application. Deux points valent d'être fixés :
//
//  1. `updateLocale` pose le cookie AVANT d'écrire en base, et c'est délibéré :
//     la langue doit changer à l'écran même si l'écriture échoue. Mais elle
//     renvoie alors une erreur — annoncer un succès laisserait croire que la
//     préférence est retenue, alors qu'elle sera perdue à la session suivante.
//
//  2. Une valeur non supportée doit être refusée AVANT de toucher au cookie.
//     Sans cela, `NEXT_LOCALE` prendrait une valeur dont l'application ne sait
//     rien faire, et l'interface se retrouverait sans traductions.
// ──────────────────────────────────────────────────────────────────────────

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { updateLocale, syncLocale } from "@/app/(protected)/settings/actions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("updateLocale", () => {
  it("pose le cookie et enregistre la préférence", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);

    expect(await updateLocale("es")).toEqual({ success: true });

    expect(cookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "es", expect.objectContaining({ path: "/" }));
    const b = mock.buildersFor("profiles")[0];
    expect(b.update).toHaveBeenCalledWith({ locale: "es" });
    expect(b.eq).toHaveBeenCalledWith("id", "u1");
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("refuse une langue inconnue sans toucher au cookie", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);

    expect(await updateLocale("kl")).toEqual({ error: "unsupportedValue" });

    // Le cookie aurait pris une valeur dont l'application ne sait rien faire.
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("change quand même la langue à l'écran pour un visiteur non connecté", async () => {
    // Pas de session : rien à enregistrer, mais le cookie suffit à traduire.
    const mock = createSupabaseMock({ user: null });
    use(mock);

    expect(await updateLocale("en")).toEqual({ success: true });
    expect(cookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "en", expect.anything());
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("signale l'échec d'écriture, tout en ayant posé le cookie", async () => {
    // Le cas qui compte : la langue change à l'écran, mais la préférence sera
    // perdue à la prochaine session. On le dit plutôt que d'annoncer un succès.
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ error: { message: 'permission denied for table "profiles"' } }],
    });
    use(mock);

    const res = await updateLocale("fr");
    expect(res).toEqual({ error: "saveFailed" });
    expect(cookieSet).toHaveBeenCalled();
    // Un CODE, jamais le texte de PostgreSQL.
    expect(JSON.stringify(res)).not.toContain("profiles");
  });
});

describe("syncLocale", () => {
  it("recopie dans le cookie la préférence lue en base", async () => {
    await syncLocale("es");
    expect(cookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "es", expect.anything());
  });

  it("ignore une valeur non supportée", async () => {
    await syncLocale("kl");
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
