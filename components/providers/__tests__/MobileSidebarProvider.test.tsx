import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  MobileSidebarProvider,
  useMobileSidebar,
} from "@/components/providers/MobileSidebarProvider";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MobileSidebarProvider>{children}</MobileSidebarProvider>
);

describe("MobileSidebarProvider", () => {
  it("expose et met à jour l'état du drawer et le contenu injecté", () => {
    const { result } = renderHook(() => useMobileSidebar(), { wrapper });

    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.mobileSidebar).toBeNull();

    act(() => result.current.setDrawerOpen(true));
    expect(result.current.drawerOpen).toBe(true);

    act(() => result.current.setMobileSidebar(<span data-testid="injected" />));
    expect(result.current.mobileSidebar).not.toBeNull();

    act(() => result.current.setMobileSidebar(null));
    expect(result.current.mobileSidebar).toBeNull();
  });

  it("hors provider : valeurs neutres, setters no-op (pas de crash)", () => {
    const { result } = renderHook(() => useMobileSidebar());
    expect(result.current.drawerOpen).toBe(false);
    act(() => result.current.setDrawerOpen(true));
    expect(result.current.drawerOpen).toBe(false);
  });
});
