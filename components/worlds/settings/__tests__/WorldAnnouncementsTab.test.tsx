import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => {
  const t = Object.assign(
    (k: string, v?: Record<string, unknown>) => (v && "count" in v ? `${k}:${v.count}` : k),
    // La ligne de la cloche, dans l'aperçu : la clé, puis le titre.
    { rich: (k: string, v?: Record<string, unknown>) => `${k}:${String(v?.title ?? "")}` },
  );
  return { useTranslations: () => t, useLocale: () => "fr" };
});
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/date-display", () => ({ default: () => <span>date</span> }));
vi.mock("@/components/MarkdownRenderer", async (orig) => ({
  ...(await orig<typeof import("@/components/MarkdownRenderer")>()),
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

const flags = vi.hoisted(() => ({ direct_messages: true }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => flags }));
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    roles: [
      { id: "r-mj", name: "MJ", color: "#ef4444", lucide_icon: null },
      { id: "r-joueur", name: "Joueur", color: "#22c55e", lucide_icon: null },
    ],
  }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ username: "mojkkin" }) }));

const api = vi.hoisted(() => ({
  send: vi.fn(),
  count: vi.fn(),
  fetch: vi.fn(),
  test: vi.fn(),
  reads: vi.fn(),
  retract: vi.fn(),
  welcome: vi.fn(),
  saveWelcome: vi.fn(),
  scheduled: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/lib/worldAnnouncements", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/worldAnnouncements")>();
  return {
    ...real,
    sendWorldAnnouncement: (...a: unknown[]) => api.send(...a),
    countAnnouncementRecipients: (...a: unknown[]) => api.count(...a),
    fetchWorldAnnouncements: (...a: unknown[]) => api.fetch(...a),
    sendAnnouncementTest: (...a: unknown[]) => api.test(...a),
    fetchAnnouncementReadCounts: (...a: unknown[]) => api.reads(...a),
    retractWorldAnnouncement: (...a: unknown[]) => api.retract(...a),
    fetchWorldWelcome: (...a: unknown[]) => api.welcome(...a),
    saveWorldWelcome: (...a: unknown[]) => api.saveWelcome(...a),
    fetchScheduledAnnouncements: (...a: unknown[]) => api.scheduled(...a),
    scheduleWorldAnnouncement: (...a: unknown[]) => api.schedule(...a),
    cancelScheduledAnnouncement: (...a: unknown[]) => api.cancel(...a),
  };
});

import { WorldAnnouncementsTab } from "../WorldAnnouncementsTab";
import { toLocalInputValue } from "../announcements/ScheduledAnnouncements";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  flags.direct_messages = true;
  toast.success.mockReset();
  toast.error.mockReset();
  api.send.mockReset().mockResolvedValue({ ok: true, recipients: 4 });
  api.count.mockReset().mockResolvedValue(4);
  api.fetch.mockReset().mockResolvedValue([]);
  api.test.mockReset().mockResolvedValue({ ok: true });
  api.reads.mockReset().mockResolvedValue(new Map());
  api.retract.mockReset().mockResolvedValue({ ok: true, removed: 11 });
  api.welcome.mockReset().mockResolvedValue(null);
  api.saveWelcome.mockReset().mockResolvedValue({ ok: true });
  api.scheduled.mockReset().mockResolvedValue([]);
  api.schedule.mockReset().mockResolvedValue({ ok: true, id: "s1" });
  api.cancel.mockReset().mockResolvedValue({ ok: true });
});

describe("WorldAnnouncementsTab", () => {
  it("compte les destinataires selon le type et les rôles choisis", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    expect(await screen.findByText("recipientCount:4")).toBeInTheDocument();
    expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", [], {});

    await user.click(screen.getByRole("button", { name: "MJ" }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", ["r-mj"], {}));
    expect(screen.getByRole("button", { name: "MJ" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "allMembers" }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", [], {}));

    await user.click(screen.getByRole("radio", { name: /kindNotification/ }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "notification", [], {}));
  });

  it("sans messages privés, ne propose que la notification", async () => {
    flags.direct_messages = false;
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    expect(screen.queryByRole("radio", { name: /kindMessage/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /kindNotification/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "titleLabel" })).toBeInTheDocument();
  });

  it("une notification demande un titre, puis s'envoie après confirmation", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    await user.click(screen.getByRole("radio", { name: /kindNotification/ }));

    await user.type(screen.getByRole("textbox", { name: "body" }), "La saison reprend.");
    const send = screen.getByRole("button", { name: "send" });
    expect(send).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "titleLabel" }), "Rentrée");
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("confirmNotification:4")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "send" }));

    await waitFor(() => expect(api.send).toHaveBeenCalledWith(expect.anything(), {
      worldId: "w1", kind: "notification", title: "Rentrée", body: "La saison reprend.", roleIds: [], filters: {},
      asWorld: false, bannerDays: null,
      // Présentation (migration 235) : rien de choisi.
      extras: { label: null, imageUrl: null, showOnHome: false, pinned: false },
    }));
    expect(toast.success).toHaveBeenCalledWith("sent:4");
    // Le formulaire se vide et l'historique se relit.
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("");
    expect(api.fetch).toHaveBeenCalledTimes(2);
  });

  it("insère une variable au curseur, et l'aperçu la remplace par les valeurs de l'auteur", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    const body = screen.getByRole("textbox", { name: "body" });
    await user.type(body, "Salut  !");
    (body as HTMLTextAreaElement).setSelectionRange(6, 6);
    await user.click(screen.getByRole("button", { name: "{username}" }));
    expect(body).toHaveValue("Salut {username} !");

    await user.click(screen.getByRole("button", { name: "previewOpen" }));
    const fenetre = screen.getByTestId("announcement-preview-dialog");
    expect(within(fenetre).getByTestId("announcement-preview")).toHaveTextContent("Salut mojkkin !");
  });

  it("annonce le plafond journalier atteint et bloque l'envoi", async () => {
    const now = new Date().toISOString();
    api.fetch.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`, kind: "message", title: null, body: `msg ${i}`, role_ids: [], recipient_count: 3, created_at: now, author: { username: "mojkkin" },
      })),
    );
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    expect(await screen.findAllByTestId("announcement-row")).toHaveLength(10);
    await user.type(screen.getByRole("textbox", { name: "body" }), "Encore une");
    expect(screen.getByRole("button", { name: "send" })).toBeDisabled();
    expect(screen.getByText("errorRateLimit:10")).toBeInTheDocument();
  });

  it("nomme le refus de la base", async () => {
    api.send.mockResolvedValue({ ok: false, reason: "rate_limit" });
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    await user.type(screen.getByRole("textbox", { name: "body" }), "Coucou");
    await user.click(screen.getByRole("button", { name: "send" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "send" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("errorRateLimit:10"));
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("Coucou");
  });


  it("l'essai suit le type : aucun pour un message privé, une notification, puis un bandeau", async () => {
    api.count.mockResolvedValue(0);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:0");
    // Un message privé ne peut pas s'adresser à son auteur : l'aperçu suffit.
    expect(screen.queryByTestId("announcement-test")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /kindNotification/ }));
    const essai = screen.getByRole("button", { name: "sendTest" });
    expect(essai).toHaveAttribute("title", "sendTestHelp");
    expect(essai).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "titleLabel" }), "Salut");
    await user.type(screen.getByRole("textbox", { name: "body" }), "Bonjour {{username}");
    // Sans destinataire, l'envoi reste fermé ; l'essai, non.
    expect(screen.getByRole("button", { name: "send" })).toBeDisabled();
    await user.click(essai);
    await waitFor(() => expect(api.test).toHaveBeenCalledWith(expect.anything(), {
      worldId: "w1", kind: "notification", title: "Salut", body: "Bonjour {username}", asWorld: false,
    }));
    expect(toast.success).toHaveBeenLastCalledWith("testSent");

    await user.click(screen.getByRole("radio", { name: /kindBanner/ }));
    const bandeau = screen.getByRole("button", { name: "sendTestBanner" });
    expect(bandeau).toHaveAttribute("title", "sendTestBannerHelp");
    await user.click(bandeau);
    await waitFor(() => expect(api.test).toHaveBeenLastCalledWith(expect.anything(), {
      worldId: "w1", kind: "banner", title: "Salut", body: "Bonjour {username}", asWorld: false,
    }));
    expect(toast.success).toHaveBeenLastCalledWith("testSentBanner");
    expect(api.send).not.toHaveBeenCalled();
    // Le formulaire reste tel quel.
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("Bonjour {username}");
  });

  it("nomme le plafond des essais", async () => {
    api.test.mockResolvedValue({ ok: false, reason: "test_rate_limit" });
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    await user.click(screen.getByRole("radio", { name: /kindNotification/ }));
    await user.type(screen.getByRole("textbox", { name: "titleLabel" }), "x");
    await user.type(screen.getByRole("textbox", { name: "body" }), "x");
    await user.click(screen.getByRole("button", { name: "sendTest" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("errorTestRateLimit:10"));
  });

  it("montre les lectures, ouvre une annonce et la reprend dans le formulaire", async () => {
    api.fetch.mockResolvedValue([
      {
        id: "a1", kind: "notification", title: "Rentrée {world}", body: "La **saison** reprend, {username}.",
        role_ids: ["r-mj", "r-supprime"], recipient_count: 12, created_at: "2026-11-01T10:00:00Z", author: { username: "mojkkin" },
      },
    ]);
    api.reads.mockResolvedValue(new Map([["a1", 3]]));
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);

    const row = await screen.findByTestId("announcement-row");
    await waitFor(() => expect(within(row).getByTestId("announcement-reads")).toHaveTextContent("readCount:3"));
    expect(api.reads).toHaveBeenCalledWith(expect.anything(), "w1", ["a1"]);

    await user.click(within(row).getByRole("button"));
    const details = await screen.findByTestId("announcement-details");
    expect(within(details).getByRole("heading", { name: "Rentrée {world}" })).toBeInTheDocument();
    expect(within(details).getByText("La **saison** reprend, {username}.")).toBeInTheDocument();

    await user.click(within(details).getByRole("button", { name: "reuse" }));
    await waitFor(() => expect(screen.queryByTestId("announcement-details")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("reused");
    expect(screen.getByRole("radio", { name: /kindNotification/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "titleLabel" })).toHaveValue("Rentrée {world}");
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("La **saison** reprend, {username}.");
    // Le rôle supprimé depuis tombe ; celui qui reste est repris.
    expect(screen.getByRole("button", { name: "MJ" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "notification", ["r-mj"], {}));
  });

  it("un message privé repris sans messages privés devient une notification", async () => {
    flags.direct_messages = false;
    api.fetch.mockResolvedValue([
      { id: "a1", kind: "message", title: null, body: "Coucou", role_ids: [], recipient_count: 2, created_at: "2026-11-01T10:00:00Z", author: null },
    ]);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    const row = await screen.findByTestId("announcement-row");
    expect(within(row).getByTestId("announcement-reads")).toHaveTextContent("recipientCount:2");
    await user.click(within(row).getByRole("button"));
    await user.click(within(await screen.findByTestId("announcement-details")).getByRole("button", { name: "reuse" }));
    expect(screen.getByRole("radio", { name: /kindNotification/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("Coucou");
  });


  it("affine les destinataires : rôle exclu, arrivée récente, inactivité", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    expect(screen.queryByTestId("announcement-filters")).not.toBeInTheDocument();

    // Un rôle visé, puis exclu : il quitte les rôles visés.
    await user.click(screen.getByRole("button", { name: "MJ" }));
    await user.click(screen.getByTestId("announcement-filters-toggle"));
    const panel = screen.getByTestId("announcement-filters");
    await user.click(within(panel).getByRole("button", { name: "MJ" }));
    await waitFor(() =>
      expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", [], { exclude_role_ids: ["r-mj"] }),
    );
    expect(screen.getAllByRole("button", { name: "MJ" })[0]).toHaveAttribute("aria-pressed", "false");

    await user.click(within(within(panel).getByRole("group", { name: "filterJoined" })).getByRole("button", { name: "filterDays:30" }));
    await user.click(within(within(panel).getByRole("group", { name: "filterInactive" })).getByRole("button", { name: "filterDays:90" }));
    await waitFor(() =>
      expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", [], {
        exclude_role_ids: ["r-mj"], joined_within_days: 30, inactive_days: 90,
      }),
    );
    // Le bouton « Affiner » compte les filtres actifs.
    expect(screen.getByTestId("announcement-filters-toggle")).toHaveTextContent("3");

    // Viser à nouveau le rôle le retire des exclusions.
    await user.click(screen.getAllByRole("button", { name: "MJ" })[0]);
    await waitFor(() =>
      expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", ["r-mj"], {
        joined_within_days: 30, inactive_days: 90,
      }),
    );

    await user.type(screen.getByRole("textbox", { name: "body" }), "Coucou");
    await user.click(screen.getByRole("button", { name: "send" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "send" }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      roleIds: ["r-mj"], filters: { exclude_role_ids: [], joined_within_days: 30, inactive_days: 90 },
    })));
  });

  it("reprend aussi les filtres d'une annonce, panneau ouvert", async () => {
    api.fetch.mockResolvedValue([
      {
        id: "a1", kind: "message", title: null, body: "Revenez !", role_ids: [], filters: { exclude_role_ids: ["r-joueur"], inactive_days: 30 },
        recipient_count: 5, created_at: "2026-11-01T10:00:00Z", retracted_at: null, author: { username: "mojkkin" },
      },
    ]);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    const row = await screen.findByTestId("announcement-row");
    expect(row).toHaveTextContent("summaryExcept");
    expect(row).toHaveTextContent("summaryInactive:30");

    await user.click(within(row).getByRole("button"));
    await user.click(within(await screen.findByTestId("announcement-details")).getByRole("button", { name: "reuse" }));
    const panel = await screen.findByTestId("announcement-filters");
    expect(within(panel).getByRole("button", { name: "Joueur" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", [], { exclude_role_ids: ["r-joueur"], inactive_days: 30 }),
    );
  });

  it("retire une notification après confirmation, pas un message privé", async () => {
    api.fetch.mockResolvedValue([
      { id: "n1", kind: "notification", title: "Rentrée", body: "x", role_ids: [], filters: {}, recipient_count: 12, created_at: "2026-11-01T10:00:00Z", retracted_at: null, author: null },
      { id: "m1", kind: "message", title: null, body: "Coucou", role_ids: [], filters: {}, recipient_count: 3, created_at: "2026-11-01T09:00:00Z", retracted_at: null, author: null },
      { id: "r1", kind: "notification", title: "Ancienne", body: "y", role_ids: [], filters: {}, recipient_count: 4, created_at: "2026-10-01T09:00:00Z", retracted_at: "2026-10-02T09:00:00Z", author: null },
    ]);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    const rows = await screen.findAllByTestId("announcement-row");
    expect(within(rows[2]).getByTestId("announcement-reads")).toHaveTextContent("retracted");

    // Message privé : pas de retrait.
    await user.click(within(rows[1]).getByRole("button"));
    let details = await screen.findByTestId("announcement-details");
    expect(within(details).queryByTestId("announcement-retract")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("announcement-details")).not.toBeInTheDocument());

    // Notification déjà retirée : pas de second retrait.
    await user.click(within(rows[2]).getByRole("button"));
    details = await screen.findByTestId("announcement-details");
    expect(within(details).queryByTestId("announcement-retract")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("announcement-details")).not.toBeInTheDocument());

    await user.click(within(rows[0]).getByRole("button"));
    details = await screen.findByTestId("announcement-details");
    await user.click(within(details).getByTestId("announcement-retract"));
    const confirm = within(details).getByTestId("announcement-retract-confirm");
    expect(confirm).toHaveTextContent("retractConfirm:12");
    expect(api.retract).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "retract" }));

    await waitFor(() => expect(api.retract).toHaveBeenCalledWith(expect.anything(), "n1"));
    expect(toast.success).toHaveBeenCalledWith("retractedToast:11");
    await waitFor(() => expect(screen.queryByTestId("announcement-details")).not.toBeInTheDocument());
    expect(api.fetch).toHaveBeenCalledTimes(2);
  });

  it("nomme l'échec d'un retrait et garde le dialogue ouvert", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.retract.mockResolvedValue({ ok: false, reason: "forbidden" });
    api.fetch.mockResolvedValue([
      { id: "n1", kind: "notification", title: "Rentrée", body: "x", role_ids: [], filters: {}, recipient_count: 12, created_at: "2026-11-01T10:00:00Z", retracted_at: null, author: null },
    ]);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await user.click(within(await screen.findByTestId("announcement-row")).getByRole("button"));
    const details = await screen.findByTestId("announcement-details");
    await user.click(within(details).getByTestId("announcement-retract"));
    await user.click(within(within(details).getByTestId("announcement-retract-confirm")).getByRole("button", { name: "retract" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("forbidden"));
    expect(screen.getByTestId("announcement-details")).toBeInTheDocument();
  });

  // ── Migration 230 : bandeau, signature du monde, envois programmés ──

  it("un bandeau : titre, durée, signature du monde, et sa propre confirmation", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    // Un message privé part toujours du compte de l'auteur.
    expect(screen.queryByRole("switch", { name: "asWorld" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /kindBanner/ }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "banner", [], {}));
    const until = screen.getByRole("button", { name: "bannerUntilDismissed" });
    expect(until).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "filterDays:7" }));
    expect(screen.getByRole("button", { name: "filterDays:7" })).toHaveAttribute("aria-pressed", "true");
    expect(until).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("switch", { name: "asWorld" }));

    await user.type(screen.getByRole("textbox", { name: "titleLabel" }), "Fête");
    await user.type(screen.getByRole("textbox", { name: "body" }), "Ce soir.");
    await user.click(screen.getByRole("button", { name: "previewOpen" }));
    expect(screen.getByTestId("announcement-preview-banner")).toHaveTextContent("Fête");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("announcement-preview-dialog")).toBeNull());

    await user.click(screen.getByTestId("announcement-send"));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("confirmBanner:4")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "send" }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      kind: "banner", title: "Fête", body: "Ce soir.", asWorld: true, bannerDays: 7,
    })));
  });

  it("programme une annonce dans le futur, jamais dans le passé", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    const open = screen.getByTestId("announcement-schedule");
    expect(open).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "body" }), "Rendez-vous demain.");
    await user.click(open);

    const dialog = await screen.findByTestId("announcement-schedule-dialog");
    const input = within(dialog).getByTestId("announcement-schedule-at");
    const confirm = within(dialog).getByTestId("announcement-schedule-confirm");
    // Par défaut : dans une heure environ.
    expect(confirm).toBeEnabled();

    fireEvent.change(input, { target: { value: toLocalInputValue(new Date(Date.now() - DAY)) } });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByTestId("announcement-schedule-summary")).toHaveTextContent("scheduleInvalid");
    fireEvent.change(input, { target: { value: toLocalInputValue(new Date(Date.now() + 120 * DAY)) } });
    expect(confirm).toBeDisabled();

    const when = new Date(Date.now() + 2 * DAY);
    when.setSeconds(0, 0);
    fireEvent.change(input, { target: { value: toLocalInputValue(when) } });
    await user.click(confirm);
    await waitFor(() => expect(api.schedule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      worldId: "w1", kind: "message", body: "Rendez-vous demain.", roleIds: [], scheduledFor: when,
    })));
    expect(toast.success).toHaveBeenCalledWith("scheduled");
    await waitFor(() => expect(screen.queryByTestId("announcement-schedule-dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("");
    expect(api.scheduled).toHaveBeenCalledTimes(2);
  });

  it("garde le dialogue ouvert si la base refuse la programmation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.schedule.mockResolvedValue({ ok: false, reason: "schedule_limit" });
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    await user.type(screen.getByRole("textbox", { name: "body" }), "x");
    await user.click(screen.getByTestId("announcement-schedule"));
    await user.click(within(await screen.findByTestId("announcement-schedule-dialog")).getByTestId("announcement-schedule-confirm"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("errorScheduleLimit:20"));
    expect(screen.getByTestId("announcement-schedule-dialog")).toBeInTheDocument();
    // Le formulaire, masqué derrière le dialogue, garde le brouillon.
    expect(screen.getByTestId("announcement-text")).toHaveValue("x");
  });

  it("liste les envois programmés : annuler l'un, lire l'échec d'un autre", async () => {
    const soon = new Date(Date.now() + DAY).toISOString();
    api.scheduled.mockResolvedValue([
      { id: "s1", kind: "banner", title: "Fête", body: "x", role_ids: [], filters: {}, signed_as_world: true, banner_days: null, scheduled_for: soon, status: "pending", error: null, author: { username: "mojkkin" } },
      { id: "s2", kind: "notification", title: "Rentrée", body: "y", role_ids: [], filters: {}, signed_as_world: false, banner_days: null, scheduled_for: soon, status: "failed", error: "announcement_rate_limit", author: null },
    ]);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    const rows = await screen.findAllByTestId("scheduled-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByTestId("scheduled-error")).toHaveTextContent("errorRateLimit:10");
    expect(within(rows[1]).queryByTestId("scheduled-cancel")).not.toBeInTheDocument();

    await user.click(within(rows[0]).getByTestId("scheduled-cancel"));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(expect.anything(), "s1"));
    expect(toast.success).toHaveBeenCalledWith("scheduleCancelled");
    expect(api.scheduled).toHaveBeenCalledTimes(2);
  });

  it("retire un bandeau avec sa confirmation, et le reprend avec sa durée et sa signature", async () => {
    const created = "2026-11-01T10:00:00Z";
    const until = new Date(new Date(created).getTime() + 7 * DAY).toISOString();
    api.fetch.mockResolvedValue([
      { id: "b1", kind: "banner", title: "Fête", body: "x", role_ids: [], filters: {}, recipient_count: 12, created_at: created, retracted_at: null, signed_as_world: true, banner_until: until, author: null },
    ]);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    const row = await screen.findByTestId("announcement-row");
    expect(within(row).getByTestId("announcement-as-world")).toHaveTextContent("signedAsWorld");

    await user.click(within(row).getByRole("button"));
    let details = await screen.findByTestId("announcement-details");
    await user.click(within(details).getByTestId("announcement-retract"));
    const confirm = within(details).getByTestId("announcement-retract-confirm");
    expect(confirm).toHaveTextContent("retractBannerConfirm:12");
    await user.click(within(confirm).getByRole("button", { name: "retract" }));
    await waitFor(() => expect(api.retract).toHaveBeenCalledWith(expect.anything(), "b1"));
    expect(toast.success).toHaveBeenCalledWith("retractedBannerToast:11");
    await waitFor(() => expect(screen.queryByTestId("announcement-details")).not.toBeInTheDocument());

    await user.click(within(await screen.findByTestId("announcement-row")).getByRole("button"));
    details = await screen.findByTestId("announcement-details");
    await user.click(within(details).getByRole("button", { name: "reuse" }));
    expect(screen.getByRole("radio", { name: /kindBanner/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "filterDays:7" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: "asWorld" })).toBeChecked();
  });

  it("aperçu en direct : la notification avec son étiquette, et l'entrée de l'accueil quand elle y est", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    await user.click(screen.getByRole("radio", { name: /kindNotification/ }));
    await user.type(screen.getByRole("textbox", { name: "titleLabel" }), "Soirée {{world}");
    await user.type(screen.getByRole("textbox", { name: "body" }), "Rendez-vous ce soir.");

    const direct = screen.getByTestId("announcement-live-preview");
    expect(direct).toHaveAttribute("data-kind", "notification");
    // La cloche et la notification ouverte, variables remplacées.
    expect(within(direct).getByTestId("announcement-live-preview-bell")).toHaveTextContent("Soirée Ygg");
    const ouverte = within(direct).getByTestId("announcement-live-preview-opened");
    expect(ouverte).toHaveTextContent("Rendez-vous ce soir.");
    expect(within(direct).queryByTestId("announcement-live-preview-home")).toBeNull();

    // L'étiquette choisie paraît, avec son icône.
    await user.click(screen.getByRole("button", { name: "event" }));
    const etiquette = within(ouverte).getByTestId("announcement-label");
    expect(etiquette).toHaveAttribute("data-label", "event");
    expect(etiquette.querySelector("svg")).not.toBeNull();

    // Sur l'accueil, épinglée : l'entrée du widget suit.
    await user.click(screen.getByRole("switch", { name: "showOnHome" }));
    await user.click(screen.getByRole("switch", { name: "pinned" }));
    const accueil = within(direct).getByTestId("announcement-live-preview-home");
    expect(accueil).toHaveTextContent("Soirée Ygg");
    expect(within(accueil).getByLabelText("pinned")).toBeInTheDocument();
  });

  it("aperçu d'un message privé : la bulle, et l'étiquette dite absente du message", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
    await user.type(screen.getByRole("textbox", { name: "body" }), "Coucou");
    const direct = screen.getByTestId("announcement-live-preview");
    expect(direct).toHaveAttribute("data-kind", "message");
    expect(within(direct).getByTestId("announcement-live-preview-message")).toHaveTextContent("Coucou");
    expect(direct).not.toHaveTextContent("previewMessageExtras");
    await user.click(screen.getByRole("button", { name: "important" }));
    expect(direct).toHaveTextContent("previewMessageExtras");
  });
});
