import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HpBlockView } from "@/components/chatrooms/blocks/HpBlock";
import type { HpBlock } from "@/lib/chat-blocks";

const block = (current: number, max: number): HpBlock => ({
  _type: "hp",
  name: "Gornak",
  current,
  max,
});

function bar(container: HTMLElement) {
  return container.querySelector<HTMLElement>(".transition-all");
}

describe("HpBlockView", () => {
  it("affiche le nom et les PV", () => {
    render(<HpBlockView block={block(62, 100)} mine={false} />);
    expect(screen.getByText("Gornak")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
  });

  it("barre verte au-dessus de 60 %", () => {
    const { container } = render(<HpBlockView block={block(80, 100)} mine={false} />);
    const b = bar(container)!;
    expect(b.className).toContain("bg-emerald-500");
    expect(b.style.width).toBe("80%");
  });

  it("barre ambre entre 30 % et 60 %", () => {
    const { container } = render(<HpBlockView block={block(50, 100)} mine={false} />);
    expect(bar(container)!.className).toContain("bg-amber-500");
  });

  it("barre rouge à 30 % ou moins", () => {
    const { container } = render(<HpBlockView block={block(20, 100)} mine={false} />);
    expect(bar(container)!.className).toContain("bg-red-500");
  });

  it("largeur 0 % si max invalide (évite division par zéro)", () => {
    const { container } = render(<HpBlockView block={block(10, 0)} mine={false} />);
    expect(bar(container)!.style.width).toBe("0%");
  });

  it("clampe la largeur à 100 % si current dépasse max", () => {
    const { container } = render(<HpBlockView block={block(150, 100)} mine={false} />);
    expect(bar(container)!.style.width).toBe("100%");
  });
});
