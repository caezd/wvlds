import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SidebarWorldGuard, SidebarWorldProvider, SidebarWorldSlot } from "../SidebarWorld";

beforeEach(() => refresh.mockClear());

describe("SidebarWorldGuard", () => {
  it("ne fait rien quand la barre latérale montre le monde du salon", () => {
    render(
      <SidebarWorldProvider worldId="w1">
        <SidebarWorldGuard worldId="w1" />
      </SidebarWorldProvider>,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rafraîchit une seule fois quand le salon est d'un autre monde", () => {
    const { rerender } = render(
      <SidebarWorldProvider worldId="w1">
        <SidebarWorldGuard worldId="w2" />
      </SidebarWorldProvider>,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    // Le rafraîchissement n'a rien changé (chemin absent, par exemple) : pas de boucle.
    rerender(
      <SidebarWorldProvider worldId={null}>
        <SidebarWorldGuard worldId="w2" />
      </SidebarWorldProvider>,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("hors du layout des salons (pas de fournisseur), ne fait rien", () => {
    render(<SidebarWorldGuard worldId="w2" />);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("SidebarWorldSlot", () => {
  const arbre = (sidebarWorld: string | null, pageWorld: string | null) => (
    <SidebarWorldProvider worldId={sidebarWorld}>
      <SidebarWorldSlot>
        <aside data-testid="barre">{sidebarWorld}</aside>
      </SidebarWorldSlot>
      <SidebarWorldGuard worldId={pageWorld} />
    </SidebarWorldProvider>
  );

  it("montre la barre quand elle est du monde de la page", () => {
    render(arbre("w1", "w1"));
    expect(screen.getByTestId("barre")).toBeInTheDocument();
    expect(screen.queryByTestId("world-sidebar-skeleton")).toBeNull();
  });

  it("masque la barre d'un autre monde jusqu'au rafraîchissement", () => {
    const { rerender } = render(arbre("w1", "w2"));
    expect(screen.queryByTestId("barre")).toBeNull();
    expect(screen.getByTestId("world-sidebar-skeleton")).toBeInTheDocument();
    // Le layout s'est refait pour le bon monde : la barre revient.
    rerender(arbre("w2", "w2"));
    expect(screen.getByTestId("barre")).toHaveTextContent("w2");
  });

  it("rend la barre au bout du délai si le rafraîchissement n'a rien changé", () => {
    vi.useFakeTimers();
    try {
      render(arbre("w1", "w2"));
      expect(screen.queryByTestId("barre")).toBeNull();
      act(() => { vi.advanceTimersByTime(4000); });
      expect(screen.getByTestId("barre")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
