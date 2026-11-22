import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) => (v && "name" in v ? `${k}:${v.name}` : k),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/MarkdownRenderer", () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }));

// Le sujet temps réel : on garde le dernier écouteur pour lui envoyer des avis.
const rt = vi.hoisted(() => ({
  topic: null as string | null,
  onEvent: null as null | ((e: { event: string; payload: unknown }) => void),
  onResync: null as null | (() => void),
}));
vi.mock("@/lib/realtimeHub", () => ({
  topic: { user: (id: string) => `msgs:${id}` },
  useTopic: (t: string | null, onEvent: (e: { event: string; payload: unknown }) => void, o: { onResync?: () => void } = {}) => {
    rt.topic = t;
    rt.onEvent = onEvent;
    rt.onResync = o.onResync ?? null;
  },
}));

const api = vi.hoisted(() => ({ fetch: vi.fn(), dismiss: vi.fn() }));
vi.mock("@/lib/worldAnnouncements", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/worldAnnouncements")>();
  return {
    ...real,
    fetchWorldBanners: (...a: unknown[]) => api.fetch(...a),
    dismissWorldBanner: (...a: unknown[]) => api.dismiss(...a),
  };
});

import { WorldAnnouncementBanners } from "../WorldAnnouncementBanners";

const BANNER = { id: "b1", title: "Fête ce soir", body: "Rendez-vous à la taverne.", created_at: "2026-11-22T10:00:00Z", signer: "Ygg", signed_as_world: true };

beforeEach(() => {
  rt.topic = null;
  rt.onEvent = null;
  rt.onResync = null;
  api.fetch.mockReset().mockResolvedValue([BANNER]);
  api.dismiss.mockReset().mockResolvedValue(true);
});

describe("WorldAnnouncementBanners", () => {
  it("affiche les bandeaux du monde, avec leur signature", async () => {
    render(<WorldAnnouncementBanners worldId="w1" userId="u1" />);
    const banner = await screen.findByTestId("world-banner");
    expect(banner).toHaveTextContent("Fête ce soir");
    expect(banner).toHaveTextContent("Rendez-vous à la taverne.");
    expect(banner).toHaveTextContent("signedBy:Ygg");
    expect(api.fetch).toHaveBeenCalledWith(expect.anything(), "w1");
    expect(rt.topic).toBe("msgs:u1");
  });

  it("rien sans bandeau, ni sans compte", async () => {
    api.fetch.mockResolvedValue([]);
    const { container, rerender } = render(<WorldAnnouncementBanners worldId="w1" userId="u1" />);
    await waitFor(() => expect(api.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    api.fetch.mockClear();
    rerender(<WorldAnnouncementBanners worldId="w1" userId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("fermer un bandeau le retire tout de suite et l'enregistre", async () => {
    const user = userEvent.setup();
    render(<WorldAnnouncementBanners worldId="w1" userId="u1" />);
    await user.click(await screen.findByRole("button", { name: "bannerDismiss" }));
    expect(screen.queryByTestId("world-banner")).not.toBeInTheDocument();
    expect(api.dismiss).toHaveBeenCalledWith(expect.anything(), "b1");
  });

  it("se relit sur un avis de ce monde ou après une coupure, pas pour un autre monde", async () => {
    render(<WorldAnnouncementBanners worldId="w1" userId="u1" />);
    await screen.findByTestId("world-banner");
    expect(api.fetch).toHaveBeenCalledTimes(1);

    await act(async () => rt.onEvent?.({ event: "world_banner", payload: { world_id: "w2" } }));
    await act(async () => rt.onEvent?.({ event: "notification", payload: { world_id: "w1" } }));
    expect(api.fetch).toHaveBeenCalledTimes(1);

    api.fetch.mockResolvedValue([]);
    await act(async () => rt.onEvent?.({ event: "world_banner", payload: { world_id: "w1" } }));
    expect(api.fetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByTestId("world-banner")).not.toBeInTheDocument());

    await act(async () => rt.onResync?.());
    expect(api.fetch).toHaveBeenCalledTimes(3);
  });
});
