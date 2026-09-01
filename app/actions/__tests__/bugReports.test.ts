import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { deleteBugReport, setBugReportStatus, submitBugReport } from "@/app/actions/bugReports";
import { BUG_REPORT_MAX_LENGTH, BUG_REPORT_URL_MAX_LENGTH } from "@/lib/bugReports";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/admin", () => ({ isAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const brancher = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

/** Session valide : `getUserId` lit le `sub` des claims. */
function connecté(results?: Parameters<typeof createSupabaseMock>[0]) {
  return createSupabaseMock({ ...results, claims: { claims: { sub: "u1" } } } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("submitBugReport", () => {
  it("enregistre le signalement et son contexte", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    const res = await submitBugReport({
      description: "  Le bouton ne répond pas.  ",
      pageUrl: "https://exemple.fr/w/1",
      userAgent: "Mozilla/5.0",
    });

    expect(res).toEqual({ ok: true });
    expect(mock.buildersFor("bug_reports")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        // Enregistré débarrassé de ses espaces.
        description: "Le bouton ne répond pas.",
        page_url: "https://exemple.fr/w/1",
        user_agent: "Mozilla/5.0",
      }),
    );
  });

  // `status` et `admin_note` sont réservés au tri : ne pas les accepter ici
  // double la policy d'insertion, qui les contraint déjà (migration 137).
  it("n'écrit ni statut ni note de traitement", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    await submitBugReport({ description: "x" });

    const écrit = mock.buildersFor("bug_reports")[0].insert.mock.calls[0][0];
    expect(écrit).not.toHaveProperty("status");
    expect(écrit).not.toHaveProperty("admin_note");
  });

  it("refuse un signalement vide ou démesuré, sans appeler Supabase", async () => {
    const mock = connecté();
    brancher(mock);

    expect((await submitBugReport({ description: "   " })).ok).toBe(false);
    expect((await submitBugReport({ description: "a".repeat(BUG_REPORT_MAX_LENGTH + 1) })).ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("refuse hors session", async () => {
    const mock = createSupabaseMock();
    brancher(mock);

    const res = await submitBugReport({ description: "x" });

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
  });

  // Le contexte vient du poste client : une URL démesurée ferait rejeter toute
  // la ligne par la contrainte de longueur en base.
  it("borne une URL démesurée au lieu de la laisser passer", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    await submitBugReport({ description: "x", pageUrl: "https://x/" + "a".repeat(9000) });

    const écrit = mock.buildersFor("bug_reports")[0].insert.mock.calls[0][0];
    expect(écrit.page_url).toHaveLength(BUG_REPORT_URL_MAX_LENGTH);
  });
});

describe("submitBugReport — pièces jointes", () => {
  it("enregistre les chemins déposés sous le préfixe de l'auteur", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    await submitBugReport({
      description: "x",
      attachments: ["user-u1/a.webp", "user-u1/b.webp"],
    });

    expect(mock.buildersFor("bug_reports")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: ["user-u1/a.webp", "user-u1/b.webp"] }),
    );
  });

  // Le chemin vient du client : accepter celui d'un autre compte ferait signer
  // son dépôt, la signature étant demandée au nom de l'administrateur qui
  // consulte le rapport — dont la policy de lecture couvre tout le bucket.
  it("refuse un chemin qui désigne le dépôt d'un autre compte", async () => {
    const mock = connecté();
    brancher(mock);

    const res = await submitBugReport({ description: "x", attachments: ["user-u2/a.webp"] });

    expect(res.ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("refuse au-delà du nombre autorisé", async () => {
    const mock = connecté();
    brancher(mock);

    const res = await submitBugReport({
      description: "x",
      attachments: ["user-u1/a.webp", "user-u1/b.webp", "user-u1/c.webp", "user-u1/d.webp"],
    });

    expect(res.ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("accepte un rapport sans aucune image", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    const res = await submitBugReport({ description: "x" });

    expect(res).toEqual({ ok: true });
    expect(mock.buildersFor("bug_reports")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    );
  });
});

describe("setBugReportStatus", () => {
  it("change le statut pour un administrateur", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock({ results: [{ error: null }] });
    brancher(mock);

    const res = await setBugReportStatus("r1", "resolved");

    expect(res).toEqual({ ok: true });
    expect(mock.buildersFor("bug_reports")[0].update).toHaveBeenCalledWith({ status: "resolved" });
  });

  // La policy RLS refuserait aussi, mais par un message de PostgreSQL que
  // l'appelant afficherait tel quel : le refus mérite un code traduit.
  it("refuse un non-administrateur, sans appeler Supabase", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const mock = createSupabaseMock();
    brancher(mock);

    const res = await setBugReportStatus("r1", "resolved");

    expect(res.ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("refuse un statut inconnu avant même de vérifier les droits", async () => {
    const mock = createSupabaseMock();
    brancher(mock);

    const res = await setBugReportStatus("r1", "spam" as never);

    expect(res.ok).toBe(false);
    expect(isAdmin).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("deleteBugReport", () => {
  it("refuse un non-administrateur, sans appeler Supabase", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const mock = createSupabaseMock();
    brancher(mock);

    expect((await deleteBugReport("r1")).ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});
