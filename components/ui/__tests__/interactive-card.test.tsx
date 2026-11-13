import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InteractiveCard } from "@/components/ui/interactive-card";

describe("InteractiveCard", () => {
  it("la lueur suit le pointeur : sa position passe par deux variables CSS de l'élément", () => {
    render(<InteractiveCard>Joueurs en ligne</InteractiveCard>);
    const card = screen.getByRole("button", { name: "Joueurs en ligne" });
    card.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150, x: 100, y: 50, toJSON: () => ({}) });
    fireEvent.pointerMove(card, { clientX: 130, clientY: 90 });
    expect(card.style.getPropertyValue("--glow-x")).toBe("30px");
    expect(card.style.getPropertyValue("--glow-y")).toBe("40px");
  });

  it("une bascule : `active` pose aria-pressed ; le clic et le onPointerMove de l'appelant passent", () => {
    const onClick = vi.fn();
    const onPointerMove = vi.fn();
    render(<InteractiveCard active onClick={onClick} onPointerMove={onPointerMove}>Fiches à relire</InteractiveCard>);
    const card = screen.getByRole("button", { name: "Fiches à relire" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveAttribute("type", "button");
    fireEvent.pointerMove(card, { clientX: 1, clientY: 1 });
    fireEvent.click(card);
    expect(onPointerMove).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
  });
});
