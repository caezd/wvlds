import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { createSupabaseMock } from "@/test/supabaseMock";
import PresenceProvider, { useGlobalPresence } from "@/components/providers/PresenceProvider";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

describe("PresenceProvider — cleanup et reconnexion", () => {
  it("untrack et supprime le canal de présence au démontage", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const { unmount } = render(
      <PresenceProvider>
        <div />
      </PresenceProvider>,
    );

    await waitFor(() => expect(mock.lastChannel()?.track).toHaveBeenCalled());
    const ch = mock.lastChannel()!;

    unmount();

    expect(ch.untrack).toHaveBeenCalled();
    expect(mock.removeChannel).toHaveBeenCalledWith(ch);
  });

  it("recrée le canal de présence après un retour de connexion réseau", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
      <PresenceProvider>
        <div />
      </PresenceProvider>,
    );

    await waitFor(() => expect(mock.lastChannel()?.track).toHaveBeenCalled());
    const oldCh = mock.lastChannel()!;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(mock.removeChannel).toHaveBeenCalledWith(oldCh));
    const newCh = mock.lastChannel()!;
    expect(newCh).not.toBe(oldCh);
    expect(newCh.name).toBe("presence:app");
    await waitFor(() => expect(newCh.track).toHaveBeenCalled());
  });
});

// Chainable minimal ne couvrant que .update().eq() — seule la chaîne
// réellement utilisée par setAppearOffline() — pour forcer une erreur sur
// UN SEUL appel .from() précis, sans perturber le heartbeat déclenché au
// montage (qui consomme aussi .from(TABLE.PROFILES).update(...)).
function errorBuilder() {
  const b = {
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve),
  } as { then: unknown; update?: unknown; eq?: unknown };
  b.update = () => b;
  b.eq = () => b;
  return b;
}

function StatusConsumer() {
  const { setStatus, status } = useGlobalPresence();
  return (
    <button onClick={() => void setStatus("invisible")}>
      changer ({status})
    </button>
  );
}

describe("PresenceProvider — confirmation du changement de statut", () => {
  it("setStatus() résout à true sans erreur (succès par défaut du mock)", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(
      <PresenceProvider>
        <StatusConsumer />
      </PresenceProvider>,
    );
    await waitFor(() => expect(mock.lastChannel()?.track).toHaveBeenCalled());

    await user.click(screen.getByText(/changer/));

    await waitFor(() => {
      const builders = mock.buildersFor("profiles");
      expect(
        builders.some((b) =>
          (b.update as ReturnType<typeof vi.fn>).mock.calls.some(
            (c: unknown[]) => (c[0] as Record<string, unknown>)?.appear_offline === true,
          ),
        ),
      ).toBe(true);
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("annule le changement et affiche une erreur si l'enregistrement échoue", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(
      <PresenceProvider>
        <StatusConsumer />
      </PresenceProvider>,
    );
    await waitFor(() => expect(mock.lastChannel()?.track).toHaveBeenCalled());
    expect(screen.getByText("changer (online)")).toBeInTheDocument();

    // Ne fait échouer que le prochain appel .from() — celui déclenché par le
    // clic ci-dessous, pas le heartbeat déjà résolu au montage.
    mock.from.mockImplementationOnce(() => errorBuilder() as never);

    await user.click(screen.getByText(/changer/));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Le statut affiché revient à "online" — pas resté bloqué sur "invisible".
    expect(screen.getByText("changer (online)")).toBeInTheDocument();
  });
});
