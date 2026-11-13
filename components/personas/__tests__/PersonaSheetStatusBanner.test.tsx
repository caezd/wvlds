import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { PersonaSheetStatusBanner } from "@/components/personas/PersonaSheetBadge";

describe("PersonaSheetStatusBanner", () => {
  it("l'état en gras, son explication, et les actions à droite", () => {
    const { container } = render(
      <PersonaSheetStatusBanner
        persona={{ review_status: "draft", sheet_complete: true }}
        actions={<button type="button">Valider</button>}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute("data-sheet-status", "draft");
    expect(screen.getByText("Brouillon")).toHaveClass("font-semibold");
    expect(screen.getByText(/n'a pas encore été soumise/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider" })).toBeInTheDocument();
  });

  it("une fiche incomplète le dit, quel que soit son statut de relecture", () => {
    const { container } = render(<PersonaSheetStatusBanner persona={{ review_status: "submitted", sheet_complete: false }} />);
    expect(container.firstElementChild).toHaveAttribute("data-sheet-status", "incomplete");
  });
});
