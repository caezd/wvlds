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
}));
vi.mock("@/lib/worldAnnouncements", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/worldAnnouncements")>();
  return {
    ...real,
    sendWorldAnnouncement: (...a: unknown[]) => api.send(...a),
    countAnnouncementRecipients: (...a: unknown[]) => api.count(...a),
    fetchWorldAnnouncements: (...a: unknown[]) => api.fetch(...a),
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
});

describe("WorldAnnouncementsTab", () => {
  it("compte les destinataires selon le type et les rôles choisis", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementsTab worldId="w1" worldName="Ygg" />);
    expect(await screen.findByText("recipientCount:4")).toBeInTheDocument();
    expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", []);

    await user.click(screen.getByRole("button", { name: "MJ" }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", ["r-mj"]));
    expect(screen.getByRole("button", { name: "MJ" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "allMembers" }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "message", []));

    await user.click(screen.getByRole("radio", { name: /kindNotification/ }));
    await waitFor(() => expect(api.count).toHaveBeenLastCalledWith(expect.anything(), "w1", "notification", []));
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
      worldId: "w1", kind: "notification", title: "Rentrée", body: "La saison reprend.", roleIds: [],
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
});
