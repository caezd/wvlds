import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/LazyLucideIcon", () => ({
  LazyLucideIcon: ({ name }: { name: string }) => <svg data-testid={`icon-${name}`} />,
}));

import { RoleChip } from "@/components/worlds/members/RoleChip";

const ROLE = { name: "Administrateur", color: "#ef4444", lucide_icon: null };

describe("RoleChip", () => {
  it("en pastille : bordure teintée de la couleur du rôle, point coloré et nom", () => {
    render(<RoleChip role={ROLE} />);
    const chip = screen.getByText("Administrateur").parentElement!;
    expect(chip).toHaveClass("rounded-full", "border");
    expect(chip.style.borderColor).toBe("rgba(239, 68, 68, 0.333)");
    expect(chip.querySelector("[aria-hidden]")).toHaveStyle({ backgroundColor: "#ef4444" });
  });

  it("plain : ni bordure, ni fond, ni marges — seulement le point et le nom", () => {
    render(<RoleChip role={ROLE} plain className="text-sm" />);
    const chip = screen.getByText("Administrateur").parentElement!;
    expect(chip).not.toHaveClass("rounded-full");
    expect(chip).not.toHaveClass("border");
    expect(chip.getAttribute("style")).toBeNull();
    expect(chip).toHaveClass("text-sm");
    expect(chip.querySelector("[aria-hidden]")).toHaveStyle({ backgroundColor: "#ef4444" });
  });

  it("l'icône Lucide remplace le point quand le rôle en a une", () => {
    render(<RoleChip role={{ ...ROLE, lucide_icon: "crown" }} plain />);
    expect(screen.getByTestId("icon-crown")).toBeInTheDocument();
  });
});
