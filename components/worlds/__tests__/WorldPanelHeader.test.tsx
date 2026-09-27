import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/sidebar/MobileDrawerOpenButton", () => ({ MobileDrawerOpenButton: () => null }));

import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

describe("WorldPanelHeader", () => {
  it("peint le fond ambiant : celui du body sous lg, bg-background au-delà", () => {
    render(<WorldPanelHeader title="Chronologie" />);
    const header = screen.getByText("Chronologie").parentElement!;
    const classes = header.className.split(" ");
    // Sous `lg`, `<main>` est transparent (AppShell.tsx) : un `bg-background`
    // seul faisait une bande plus claire au-dessus des panneaux.
    expect(classes).toEqual(expect.arrayContaining(["bg-body", "lg:bg-background"]));
    expect(classes).not.toContain("bg-background");
  });
});
