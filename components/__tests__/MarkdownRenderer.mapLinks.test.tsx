import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarkdownContent } from "@/components/MarkdownRenderer";

describe("MarkdownContent — liens map:", () => {
  it("rend un lien map: en bouton qui ouvre la carte sur le lieu", async () => {
    const onMapLink = vi.fn();
    render(<MarkdownContent content="[Le port](map:pin1)" onMapLink={onMapLink} />);

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    expect(onMapLink).toHaveBeenCalledWith("pin1");
  });

  it("rend un lieu introuvable comme cassé, non cliquable", () => {
    render(<MarkdownContent content="[Innsmouth](map:)" onMapLink={vi.fn()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Innsmouth").className).toContain("text-destructive");
  });

  it("reste cassé sans preneur, comme un wiki: hors contexte", () => {
    render(<MarkdownContent content="[Le port](map:pin1)" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Le port").className).toContain("text-destructive");
  });
});
