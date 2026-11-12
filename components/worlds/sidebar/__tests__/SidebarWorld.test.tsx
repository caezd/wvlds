import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SidebarWorldGuard, SidebarWorldProvider } from "../SidebarWorld";

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
