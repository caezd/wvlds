import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { PersonaStatusBadge } from "@/components/personas/PersonaStatusBadge";
import { isRetiredStatus, narrativeStatusOf } from "@/lib/personaStatus";

describe("PersonaStatusBadge", () => {
  it("ne rend rien pour un persona vivant", () => {
    const { container } = render(<PersonaStatusBadge status="alive" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nomme le statut, en compact l'icône seule avec le libellé au survol", () => {
    const { rerender } = render(<PersonaStatusBadge status="dead" />);
    expect(screen.getByText("Décédé")).toBeInTheDocument();
    rerender(<PersonaStatusBadge status="missing" compact />);
    const badge = screen.getByLabelText("Disparu");
    expect(badge).toHaveAttribute("title", "Disparu");
    expect(badge.textContent).toBe("");
  });
});

describe("lib/personaStatus", () => {
  it("décédé et retiré ont quitté la scène ; disparu et vivant, non", () => {
    expect(isRetiredStatus("dead")).toBe(true);
    expect(isRetiredStatus("retired")).toBe(true);
    expect(isRetiredStatus("missing")).toBe(false);
    expect(isRetiredStatus("alive")).toBe(false);
    expect(isRetiredStatus(null)).toBe(false);
  });

  it("une valeur inconnue vaut « vivant »", () => {
    expect(narrativeStatusOf("dead")).toBe("dead");
    expect(narrativeStatusOf("zombie")).toBe("alive");
    expect(narrativeStatusOf(null)).toBe("alive");
  });
});
