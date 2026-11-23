import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) => (v && "name" in v ? `${k}:${v.name}` : k),
  useLocale: () => "fr",
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/date-display", () => ({ default: () => <span>date</span> }));
vi.mock("@/components/MarkdownRenderer", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { createClient } from "@/lib/supabase/client";
import { __resetRealtimeHub } from "@/lib/realtimeHub";
import { WorldLatestAnnouncementsWidget } from "@/components/worlds/home/widgets/WorldLatestAnnouncementsWidget";
import type { HomeAnnouncement } from "@/lib/worldAnnouncements";

function annonce(over: Partial<HomeAnnouncement> = {}): HomeAnnouncement {
  return {
    id: "a1", kind: "notification", title: "Rentrée", body: "La **saison** reprend.", label: "event",
    image_url: null, pinned: false, created_at: new Date().toISOString(), edited_at: null,
    signed_as_world: true, signer: "Ygg", signer_avatar_url: null, ...over,
  };
}

let mock: ReturnType<typeof createSupabaseMock>;
beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeHub();
  mock = createSupabaseMock({ user: { id: "u1" } });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
});

describe("WorldLatestAnnouncementsWidget", () => {
  it("liste les annonces du serveur, épinglée et étiquetée, sans rien redemander", () => {
    render(
      <WorldLatestAnnouncementsWidget
        worldId="w1"
        initialAnnouncements={[annonce({ pinned: true }), annonce({ id: "a2", title: "Maintenance", label: "maintenance" })]}
      />,
    );
    const items = screen.getAllByTestId("latest-announcement");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Rentrée")).toBeInTheDocument();
    // Le texte s'affiche sans sa mise en forme Markdown.
    expect(within(items[0]).getByText("La saison reprend.")).toBeInTheDocument();
    expect(within(items[0]).getByLabelText("pinned")).toBeInTheDocument();
    expect(within(items[1]).getByTestId("announcement-label")).toHaveAttribute("data-label", "maintenance");
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("ne s'affiche pas sans annonce", () => {
    const { container } = render(<WorldLatestAnnouncementsWidget worldId="w1" initialAnnouncements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ouvre l'annonce en entier", async () => {
    render(<WorldLatestAnnouncementsWidget worldId="w1" initialAnnouncements={[annonce({ edited_at: new Date().toISOString() })]} />);
    await userEvent.setup().click(screen.getByTestId("latest-announcement"));
    const dialog = await screen.findByTestId("latest-announcement-dialog");
    expect(within(dialog).getByText("La **saison** reprend.")).toBeInTheDocument();
    expect(within(dialog).getByText("signedBy:Ygg")).toBeInTheDocument();
    expect(within(dialog).getByText("edited")).toBeInTheDocument();
  });

  it("se relit sur un avis `announcement` du canal du monde, et au retour d'une coupure", async () => {
    mock.rpc.mockResolvedValue({ data: [annonce({ id: "a9", title: "Nouvelle" })], error: null });
    render(<WorldLatestAnnouncementsWidget worldId="w1" initialAnnouncements={[annonce()]} />);
    const canal = mock.channelNamed("world:w1")!;

    act(() => canal.emit((h) => h.type === "broadcast", { event: "announcement", payload: { id: "a9" } }));
    await waitFor(() => expect(screen.getByText("Nouvelle")).toBeInTheDocument());
    expect(mock.rpc).toHaveBeenCalledWith("get_world_home_announcements", { p_world_id: "w1", p_limit: 3 });

    mock.rpc.mockClear();
    const rappel = canal.subscribe.mock.calls[0][0] as (s: string) => void;
    act(() => rappel("CHANNEL_ERROR"));
    act(() => rappel("SUBSCRIBED"));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(1));
  });
});
