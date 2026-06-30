import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MobileSidebarProvider,
  useMobileSidebar,
} from "@/components/providers/MobileSidebarProvider";
import { MobileSidebarSlot } from "@/components/sidebar/MobileSidebarSlot";

// Lit le contenu injecté dans le contexte pour vérifier ce que verrait le drawer.
function Probe() {
  const { mobileSidebar } = useMobileSidebar();
  return <div data-testid="probe">{mobileSidebar}</div>;
}

describe("MobileSidebarSlot", () => {
  it("met à jour le contenu injecté quand les children changent", () => {
    const tree = (label: string) => (
      <MobileSidebarProvider>
        <Probe />
        <MobileSidebarSlot>
          <span>{label}</span>
        </MobileSidebarSlot>
      </MobileSidebarProvider>
    );

    const { rerender } = render(tree("v1"));
    expect(screen.getByText("v1")).toBeInTheDocument();

    // ex: router.refresh() recharge WorldSidebar → nouveau node injecté
    rerender(tree("v2"));
    expect(screen.queryByText("v1")).not.toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("retire le contenu injecté quand le slot est démonté", () => {
    const tree = (withSlot: boolean) => (
      <MobileSidebarProvider>
        <Probe />
        {withSlot ? (
          <MobileSidebarSlot>
            <span>nav</span>
          </MobileSidebarSlot>
        ) : null}
      </MobileSidebarProvider>
    );

    const { rerender } = render(tree(true));
    expect(screen.getByText("nav")).toBeInTheDocument();

    rerender(tree(false));
    expect(screen.queryByText("nav")).not.toBeInTheDocument();
  });
});
