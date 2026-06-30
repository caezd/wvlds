import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";
import PresenceProvider from "@/components/providers/PresenceProvider";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

// Identité issue du contexte, mutable entre les rendus pour simuler l'arrivée
// tardive du profil (login client : initialUser=null puis profil async).
const ctx = vi.hoisted(() => ({
  value: {
    userId: "u1",
    username: "moi",
    avatarUrl: null,
    appearOffline: false,
    plan: null,
    user: null,
    loading: false,
  },
}));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ctx.value }));

beforeEach(() => {
  vi.clearAllMocks();
  ctx.value = { ...ctx.value, appearOffline: false };
});

describe("PresenceProvider — appear_offline résolu tardivement", () => {
  it("untrack la présence quand appear_offline passe à true après le montage", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const { rerender } = render(
      <PresenceProvider>
        <div />
      </PresenceProvider>,
    );

    // Au montage (appear_offline=false), l'utilisateur est tracké en ligne.
    await waitFor(() => {
      const ch = mock.lastChannel();
      expect(ch?.track).toHaveBeenCalled();
    });
    const ch = mock.lastChannel()!;
    expect(ch.untrack).not.toHaveBeenCalled();

    // Le profil se résout : appear_offline=true → on doit quitter la présence.
    await act(async () => {
      ctx.value = { ...ctx.value, appearOffline: true };
      rerender(
        <PresenceProvider>
          <div />
        </PresenceProvider>,
      );
    });

    await waitFor(() => expect(ch.untrack).toHaveBeenCalled());
  });

  it("ne track pas quand appear_offline est déjà true au montage", async () => {
    ctx.value = { ...ctx.value, appearOffline: true };
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
      <PresenceProvider>
        <div />
      </PresenceProvider>,
    );

    await waitFor(() => expect(mock.lastChannel()).toBeTruthy());
    const ch = mock.lastChannel()!;
    // subscribe() résout SUBSCRIBED → track(true), mais appearOfflineRef=true
    // doit court-circuiter le track.
    expect(ch.track).not.toHaveBeenCalled();
  });
});
