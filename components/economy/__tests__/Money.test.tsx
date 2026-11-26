import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/LazyLucideIcon", () => ({
  LazyLucideIcon: ({ name, style }: { name: string; style?: React.CSSProperties }) => <svg data-icon={name} style={style} />,
}));

import { Money } from "@/components/economy/Money";
import type { CurrencyUnit } from "@/lib/worldCurrency";

const SIMPLE: CurrencyUnit[] = [
  { name: "Or", short: "po", value: 10_000 },
  { name: "Argent", short: "pa", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];

describe("Money", () => {
  it("sans aspect, s'écrit comme formatAmount", () => {
    render(<Money amount={12_345} units={SIMPLE} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("1 po 23 pa 45 pc");
  });

  it("signe un débit, et un crédit sur demande", () => {
    const { rerender } = render(<Money amount={-500} units={SIMPLE} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("−5 pa");
    rerender(<Money amount={500} units={SIMPLE} signed data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("+5 pa");
  });

  it("zéro s'écrit dans l'unité de base", () => {
    render(<Money amount={0} units={SIMPLE} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("0 pc");
  });

  it("une image remplace l'abréviation à l'œil, qui reste lue par les lecteurs d'écran", () => {
    const units: CurrencyUnit[] = [{ name: "Or", short: "po", value: 1, image: "https://exemple.org/or.webp" }];
    const { container } = render(<Money amount={5} units={units} data-testid="m" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://exemple.org/or.webp");
    expect(screen.getByTestId("m")).toHaveTextContent("5 po");
    expect(screen.getByText("po")).toHaveClass("sr-only");
  });

  it("une icône prend la couleur du palier", () => {
    const units: CurrencyUnit[] = [{ name: "Or", short: "po", value: 1, icon: "coins", color: "#d4a017" }];
    const { container } = render(<Money amount={5} units={units} />);
    const icon = container.querySelector("[data-icon='coins']");
    expect(icon).not.toBeNull();
    expect(icon).toHaveStyle({ color: "#d4a017" });
    expect(screen.getByText("po")).toHaveClass("sr-only");
  });

  it("une couleur seule teinte l'abréviation", () => {
    const units: CurrencyUnit[] = [{ name: "Or", short: "po", value: 1, color: "#d4a017" }];
    render(<Money amount={5} units={units} />);
    expect(screen.getByText("po")).toHaveStyle({ color: "#d4a017" });
    expect(screen.getByText("po")).not.toHaveClass("sr-only");
  });

  it("sans abréviation, le nom du palier", () => {
    render(<Money amount={3} units={[{ name: "Pièce", short: "", value: 1 }]} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("3 Pièce");
  });
});
