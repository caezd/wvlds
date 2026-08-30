import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

import {
  getUnreadCounts,
  resetUnreadCounts,
  setUnreadCounts,
  useRoomUnread,
  useWorldUnread,
} from "@/lib/unreadStore";

beforeEach(() => resetUnreadCounts());
afterEach(() => resetUnreadCounts());

describe("setUnreadCounts", () => {
  it("publie les compteurs de salles et de mondes", () => {
    setUnreadCounts({ c1: 3 }, { w1: 3 });
    expect(getUnreadCounts()).toEqual({ rooms: { c1: 3 }, worlds: { w1: 3 } });
  });

  it("ne notifie pas quand rien ne change", () => {
    const onRender = vi.fn();
    function Probe() {
      useRoomUnread("c1");
      onRender();
      return null;
    }
    setUnreadCounts({ c1: 3 }, { w1: 3 });
    render(<Probe />);
    const base = onRender.mock.calls.length;

    // Mêmes valeurs, objets différents : aucun abonné ne doit être réveillé.
    act(() => setUnreadCounts({ c1: 3 }, { w1: 3 }));
    expect(onRender.mock.calls.length).toBe(base);
  });
});

describe("useRoomUnread / useWorldUnread", () => {
  it("renvoie 0 pour une clé inconnue ou absente", () => {
    function Probe({ id }: { id?: string | null }) {
      return <span data-testid="v">{useRoomUnread(id)}</span>;
    }
    const { rerender } = render(<Probe id="inconnue" />);
    expect(screen.getByTestId("v").textContent).toBe("0");
    rerender(<Probe id={null} />);
    expect(screen.getByTestId("v").textContent).toBe("0");
  });

  it("suit les variations de sa propre clé", () => {
    function Probe() {
      return (
        <>
          <span data-testid="room">{useRoomUnread("c1")}</span>
          <span data-testid="world">{useWorldUnread("w1")}</span>
        </>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId("room").textContent).toBe("0");

    act(() => setUnreadCounts({ c1: 2 }, { w1: 2 }));
    expect(screen.getByTestId("room").textContent).toBe("2");
    expect(screen.getByTestId("world").textContent).toBe("2");

    act(() => setUnreadCounts({}, {}));
    expect(screen.getByTestId("room").textContent).toBe("0");
    expect(screen.getByTestId("world").textContent).toBe("0");
  });

  it("ne re-rend QUE les abonnés de la clé qui change", () => {
    // Le cœur du changement : un message dans la salle c2 ne doit pas réveiller
    // l'abonné de c1, alors que le contexte les réveillait tous les deux.
    const renderC1 = vi.fn();
    const renderC2 = vi.fn();

    function Probe({ id, onRender }: { id: string; onRender: () => void }) {
      const n = useRoomUnread(id);
      onRender();
      return <span data-testid={id}>{n}</span>;
    }

    setUnreadCounts({ c1: 1, c2: 1 }, {});
    render(
      <>
        <Probe id="c1" onRender={renderC1} />
        <Probe id="c2" onRender={renderC2} />
      </>,
    );
    const baseC1 = renderC1.mock.calls.length;
    const baseC2 = renderC2.mock.calls.length;

    act(() => setUnreadCounts({ c1: 1, c2: 7 }, {}));

    expect(renderC2.mock.calls.length).toBeGreaterThan(baseC2);
    expect(renderC1.mock.calls.length).toBe(baseC1);
    expect(screen.getByTestId("c1").textContent).toBe("1");
    expect(screen.getByTestId("c2").textContent).toBe("7");
  });

  it("se désabonne au démontage", () => {
    const onRender = vi.fn();
    function Probe() {
      useRoomUnread("c1");
      onRender();
      return null;
    }
    const { unmount } = render(<Probe />);
    const base = onRender.mock.calls.length;
    unmount();

    act(() => setUnreadCounts({ c1: 9 }, {}));
    expect(onRender.mock.calls.length).toBe(base);
  });

  it("resetUnreadCounts vide les deux Records", () => {
    setUnreadCounts({ c1: 4 }, { w1: 4 });
    resetUnreadCounts();
    expect(getUnreadCounts()).toEqual({ rooms: {}, worlds: {} });
  });
});
