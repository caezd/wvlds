import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

import {
  derivePresenceStatus,
  getPresenceStatuses,
  resetPresenceStatuses,
  setPresenceStatuses,
  useUserPresence,
  type GlobalPresenceMeta,
} from "@/lib/presenceStore";
import { PRESENCE } from "@/lib/constants";

const NOW = new Date("2026-08-26T12:00:00.000Z").getTime();

/** Meta d'un utilisateur actif il y a `agoMs`. */
function meta(userId: string, agoMs: number): GlobalPresenceMeta {
  return { user_id: userId, last_active_at: new Date(NOW - agoMs).toISOString() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetPresenceStatuses();
});

afterEach(() => {
  vi.useRealTimers();
  resetPresenceStatuses();
});

describe("derivePresenceStatus", () => {
  it("classe une activité récente en `online`", () => {
    expect(derivePresenceStatus(meta("u1", 1_000))).toBe("online");
  });

  it("classe une activité au-delà de la fenêtre d'absence en `away`", () => {
    expect(derivePresenceStatus(meta("u1", PRESENCE.AWAY_WINDOW_MS + 1_000))).toBe("away");
  });

  it("classe une activité au-delà de la fenêtre hors-ligne en `offline`", () => {
    expect(derivePresenceStatus(meta("u1", PRESENCE.OFFLINE_WINDOW_MS + 1_000))).toBe("offline");
  });

  it("retombe sur `offline` sans horodatage ou avec une date illisible", () => {
    expect(derivePresenceStatus(null)).toBe("offline");
    expect(derivePresenceStatus({ user_id: "u1" })).toBe("offline");
    expect(derivePresenceStatus({ user_id: "u1", last_active_at: "pas-une-date" })).toBe("offline");
  });
});

describe("setPresenceStatuses", () => {
  it("ne stocke pas les utilisateurs hors ligne (valeur par défaut à la lecture)", () => {
    setPresenceStatuses({
      u1: meta("u1", 1_000),
      u2: meta("u2", PRESENCE.OFFLINE_WINDOW_MS + 1_000),
    });
    expect(getPresenceStatuses()).toEqual({ u1: "online" });
  });

  it("ne notifie pas quand aucun statut ne change", () => {
    const listener = vi.fn();
    // On observe via un composant : un rendu supplémentaire = une notification.
    function Probe() {
      const status = useUserPresence("u1");
      listener();
      return <span data-testid="s">{status}</span>;
    }
    setPresenceStatuses({ u1: meta("u1", 1_000) });
    render(<Probe />);
    const rendersAfterMount = listener.mock.calls.length;

    // Même statut dérivé (toujours "online"), horodatage différent.
    act(() => setPresenceStatuses({ u1: meta("u1", 2_000) }));

    expect(listener.mock.calls.length).toBe(rendersAfterMount);
    expect(screen.getByTestId("s").textContent).toBe("online");
  });
});

describe("useUserPresence", () => {
  it("renvoie `offline` pour un utilisateur inconnu ou un id absent", () => {
    function Probe({ id }: { id?: string | null }) {
      return <span data-testid="s">{useUserPresence(id)}</span>;
    }
    const { rerender } = render(<Probe id="inconnu" />);
    expect(screen.getByTestId("s").textContent).toBe("offline");

    rerender(<Probe id={null} />);
    expect(screen.getByTestId("s").textContent).toBe("offline");
  });

  it("reflète le statut courant et ses changements", () => {
    function Probe() {
      return <span data-testid="s">{useUserPresence("u1")}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("s").textContent).toBe("offline");

    act(() => setPresenceStatuses({ u1: meta("u1", 1_000) }));
    expect(screen.getByTestId("s").textContent).toBe("online");

    act(() => setPresenceStatuses({ u1: meta("u1", PRESENCE.AWAY_WINDOW_MS + 1_000) }));
    expect(screen.getByTestId("s").textContent).toBe("away");

    act(() => setPresenceStatuses({}));
    expect(screen.getByTestId("s").textContent).toBe("offline");
  });

  it("ne re-rend QUE les abonnés dont l'utilisateur a changé", () => {
    // C'est tout l'intérêt du store : avec le contexte, les deux sondes se
    // re-rendaient ensemble à chaque mouvement de présence.
    const renderU1 = vi.fn();
    const renderU2 = vi.fn();

    function Probe({ id, onRender }: { id: string; onRender: () => void }) {
      const status = useUserPresence(id);
      onRender();
      return <span data-testid={id}>{status}</span>;
    }

    setPresenceStatuses({ u1: meta("u1", 1_000), u2: meta("u2", 1_000) });
    render(
      <>
        <Probe id="u1" onRender={renderU1} />
        <Probe id="u2" onRender={renderU2} />
      </>,
    );
    const baseU1 = renderU1.mock.calls.length;
    const baseU2 = renderU2.mock.calls.length;

    // Seul u2 bascule en "away" ; u1 ne bouge pas.
    act(() =>
      setPresenceStatuses({
        u1: meta("u1", 1_000),
        u2: meta("u2", PRESENCE.AWAY_WINDOW_MS + 1_000),
      }),
    );

    expect(renderU2.mock.calls.length).toBeGreaterThan(baseU2);
    expect(renderU1.mock.calls.length).toBe(baseU1);
    expect(screen.getByTestId("u1").textContent).toBe("online");
    expect(screen.getByTestId("u2").textContent).toBe("away");
  });

  it("se désabonne au démontage", () => {
    const onRender = vi.fn();
    function Probe() {
      useUserPresence("u1");
      onRender();
      return null;
    }
    const { unmount } = render(<Probe />);
    const base = onRender.mock.calls.length;
    unmount();

    act(() => setPresenceStatuses({ u1: meta("u1", 1_000) }));
    expect(onRender.mock.calls.length).toBe(base);
  });
});
