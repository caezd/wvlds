import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) => (v && "count" in v ? `${k}:${v.count}` : k),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/date-display", () => ({ default: () => <span>date</span> }));
vi.mock("@/components/MarkdownRenderer", () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }));

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
  };
});

import { WorldAnnouncementsTab } from "../WorldAnnouncementsTab";

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

    await user.click(screen.getByRole("button", { name: "preview" }));
    expect(screen.getByTestId("announcement-preview")).toHaveTextContent("Salut mojkkin !");
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


  it("envoie un essai à l'auteur, sans destinataire requis", async () => {
    api.count.mockResolvedValue(0);
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:0");
    const essai = screen.getByRole("button", { name: "sendTest" });
    expect(essai).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "body" }), "Salut {{username}");
    expect(screen.getByRole("button", { name: "send" })).toBeDisabled();
    await user.click(essai);
    await waitFor(() => expect(api.test).toHaveBeenCalledWith(expect.anything(), {
      worldId: "w1", kind: "message", title: "", body: "Salut {username}",
    }));
    // Un message privé ne s'adresse pas à soi-même : l'essai part en notification.
    expect(toast.success).toHaveBeenCalledWith("testSentMessage");
    expect(api.send).not.toHaveBeenCalled();
    // Le formulaire reste tel quel.
    expect(screen.getByRole("textbox", { name: "body" })).toHaveValue("Salut {username}");
  });

  it("nomme le plafond des essais", async () => {
    api.test.mockResolvedValue({ ok: false, reason: "test_rate_limit" });
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    await screen.findByText("recipientCount:4");
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
});
