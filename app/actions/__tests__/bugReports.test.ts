import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import {
  cleanBugReportAttachments,
  deleteBugReport,
  setBugReportNote,
  setBugReportStatus,
  submitBugReport,
} from "@/app/actions/bugReports";
import {
  BUG_REPORT_MAX_LENGTH,
  BUG_REPORT_NOTE_MAX_LENGTH,
  BUG_REPORT_URL_MAX_LENGTH,
} from "@/lib/bugReports";

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

describe("submitBugReport — journal d'erreurs", () => {
  const erreur = (message: string) => ({
    at: "2026-09-01T10:00:00.000Z",
    kind: "uncaught",
    message,
  });

  it("enregistre le journal reçu", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    await submitBugReport({ description: "x", clientErrors: [erreur("boum")] });

    const écrit = mock.buildersFor("bug_reports")[0].insert.mock.calls[0][0];
    expect(écrit.client_errors).toHaveLength(1);
    expect(écrit.client_errors[0].message).toBe("boum");
  });

  // Le journal traverse le réseau : une entrée malformée ferait rejeter toute
  // la ligne par la contrainte de la migration 139. Il est donc borné plutôt
  // que refusé — perdre un rapport à cause de sa pile reviendrait à perdre la
  // seule chose que son auteur ait écrite.
  it("écarte ce qui est irrecevable sans perdre le signalement", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    const res = await submitBugReport({
      description: "x",
      clientErrors: [erreur("bon"), null, "boum", { message: "" }],
    });

    expect(res).toEqual({ ok: true });
    const écrit = mock.buildersFor("bug_reports")[0].insert.mock.calls[0][0];
    expect(écrit.client_errors).toHaveLength(1);
  });

  it("borne un journal démesuré au lieu de le laisser passer", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    await submitBugReport({
      description: "x",
      clientErrors: Array.from({ length: 50 }, (_, i) => erreur(`erreur ${i}`)),
    });

    const écrit = mock.buildersFor("bug_reports")[0].insert.mock.calls[0][0];
    expect(écrit.client_errors).toHaveLength(10);
  });

  it("écrit un journal vide quand aucun n'accompagne le rapport", async () => {
    const mock = connecté({ results: [{ error: null }] });
    brancher(mock);

    await submitBugReport({ description: "x" });

    expect(mock.buildersFor("bug_reports")[0].insert.mock.calls[0][0].client_errors).toEqual([]);
  });
});

describe("submitBugReport — plafond horaire", () => {
  // Le plafond est tenu par la policy d'insertion (migration 140). On le
  // vérifie AUSSI ici pour que le refus arrive traduit : la RLS, elle, échoue
  // par un message de PostgreSQL que le formulaire afficherait tel quel.
  it("refuse au-delà du plafond, sans rien écrire", async () => {
    const mock = connecté();
    mock.rpc.mockResolvedValue({ data: 5, error: null });
    brancher(mock);

    const res = await submitBugReport({ description: "x" });

    expect(res).toEqual({ ok: false, error: "bugReportRateLimit" });
    expect(mock.buildersFor("bug_reports")).toHaveLength(0);
  });

  it("laisse passer en deçà", async () => {
    const mock = connecté({ results: [{ error: null }] });
    mock.rpc.mockResolvedValue({ data: 4, error: null });
    brancher(mock);

    expect((await submitBugReport({ description: "x" })).ok).toBe(true);
  });
});

describe("setBugReportNote", () => {
  // La note dit ce qui a été fait d'un rapport. La policy d'UPDATE la réserve
  // déjà aux administrateurs, mais elle refuserait par un message de PostgreSQL
  // que l'appelant afficherait tel quel.
  it("refuse un non-administrateur, sans appeler Supabase", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const mock = createSupabaseMock();
    brancher(mock);

    expect((await setBugReportNote("r1", "vu")).ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("enregistre la note débarrassée de ses espaces", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock({ results: [{ error: null }] });
    brancher(mock);

    expect(await setBugReportNote("r1", "  corrigé en 140  ")).toEqual({ ok: true });
    expect(mock.buildersFor("bug_reports")[0].update).toHaveBeenCalledWith({
      admin_note: "corrigé en 140",
    });
  });

  // La colonne accepte NULL, et « pas de note » se lit mieux qu'une note vide.
  it("vide la note plutôt que d'y écrire une chaîne creuse", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock({ results: [{ error: null }] });
    brancher(mock);

    await setBugReportNote("r1", "   ");

    expect(mock.buildersFor("bug_reports")[0].update).toHaveBeenCalledWith({ admin_note: null });
  });

  // La contrainte en base rejetterait la ligne par une erreur brute.
  it("refuse une note démesurée", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock();
    brancher(mock);

    const res = await setBugReportNote("r1", "n".repeat(BUG_REPORT_NOTE_MAX_LENGTH + 1));

    expect(res.ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("cleanBugReportAttachments", () => {
  it("refuse un non-administrateur, sans rien lire ni supprimer", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const mock = createSupabaseMock();
    brancher(mock);

    expect((await cleanBugReportAttachments()).ok).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });

  // La suppression passe par l'API de stockage : effacer la ligne de
  // « storage.objects » laisserait l'octet dans le stockage d'objets.
  it("supprime les images que la base a désignées", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: ["user-u1/a.webp", "user-u2/b.webp"], error: null });
    brancher(mock);

    const res = await cleanBugReportAttachments();

    expect(res).toEqual({ ok: true, removed: 2 });
    expect(mock.storageRemove).toHaveBeenCalledWith(["user-u1/a.webp", "user-u2/b.webp"]);
  });

  it("ne demande aucune suppression quand rien n'est orphelin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: [], error: null });
    brancher(mock);

    expect(await cleanBugReportAttachments()).toEqual({ ok: true, removed: 0 });
    expect(mock.storageRemove).not.toHaveBeenCalled();
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

  // Sans ça, les captures resteraient dans le bucket sans que rien ne les
  // désigne plus : injoignables par l'application, mais conservées — alors que
  // ce sont des données personnelles que la suppression était censée effacer.
  it("supprime les captures avec le rapport", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock({
      results: [{ data: { attachments: ["user-u1/a.webp", "user-u1/b.webp"] }, error: null }, { error: null }],
    });
    brancher(mock);

    const res = await deleteBugReport("r1");

    expect(res).toEqual({ ok: true });
    expect(mock.storageRemove).toHaveBeenCalledWith(["user-u1/a.webp", "user-u1/b.webp"]);
  });

  // L'ordre importe : supprimer la ligne d'abord perdrait les chemins, et
  // personne ne saurait plus quoi nettoyer.
  it("garde le rapport si ses captures n'ont pas pu être supprimées", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock({
      results: [{ data: { attachments: ["user-u1/a.webp"] }, error: null }],
      storageRemoveResult: { error: { message: "refusé" } },
    } as never);
    brancher(mock);

    const res = await deleteBugReport("r1");

    expect(res.ok).toBe(false);
    expect(mock.buildersFor("bug_reports")[0].delete).not.toHaveBeenCalled();
  });

  it("ne demande aucune suppression de fichier pour un rapport sans capture", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const mock = createSupabaseMock({
      results: [{ data: { attachments: [] }, error: null }, { error: null }],
    });
    brancher(mock);

    expect((await deleteBugReport("r1")).ok).toBe(true);
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });

});
