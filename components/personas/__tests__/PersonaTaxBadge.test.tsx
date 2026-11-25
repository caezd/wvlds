import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

import { createSupabaseMock } from "@/test/supabaseMock";

let mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => mock.client }));

import { PersonaTaxBadge } from "@/components/personas/PersonaTaxBadge";
import { invalidateTaxBadges, resetTaxBadgesForTests } from "@/lib/taxBadgeStore";

beforeEach(() => {
  resetTaxBadgesForTests();
});

describe("PersonaTaxBadge (migration 255)", () => {
  it("les personas d'un même rendu se lisent en une requête ; seul le persona en défaut porte le badge", async () => {
    mock = createSupabaseMock({
      results: [{ data: [{ persona_id: "p1", periods: 2, badge_label: null }] }],
    });
    render(
      <>
        <PersonaTaxBadge personaId="p1" />
        <PersonaTaxBadge personaId="p2" />
        <PersonaTaxBadge personaId="p1" />
      </>,
    );
    await waitFor(() => expect(screen.getAllByText("Impayé")).toHaveLength(2));
    expect(mock.builders).toHaveLength(1);
    expect(mock.builders[0].table).toBe("persona_tax_overdue");
    expect(mock.builders[0].builder.in).toHaveBeenCalledWith("persona_id", ["p1", "p2"]);
    expect(screen.getAllByText("Impayé")[0].closest("[title]")).toHaveAttribute("title", "2 périodes de taxe impayées");
  });

  it("le texte choisi par le monde ; compact : l'icône seule, nommée", async () => {
    mock = createSupabaseMock({ results: [{ data: [{ persona_id: "p1", periods: 1, badge_label: "Fauché" }] }] });
    render(<PersonaTaxBadge personaId="p1" compact />);
    expect(await screen.findByLabelText("Fauché")).toBeInTheDocument();
    expect(screen.queryByText("Fauché")).toBeNull();
  });

  it("une dette réglée : relu, le badge s'en va", async () => {
    mock = createSupabaseMock({
      results: [{ data: [{ persona_id: "p1", periods: 1, badge_label: null }] }, { data: [] }],
    });
    render(<PersonaTaxBadge personaId="p1" />);
    expect(await screen.findByText("Impayé")).toBeInTheDocument();
    act(() => invalidateTaxBadges("p1"));
    await waitFor(() => expect(screen.queryByText("Impayé")).toBeNull());
    expect(mock.builders).toHaveLength(2);
  });

  it("sans persona : rien, aucune requête", () => {
    mock = createSupabaseMock();
    const { container } = render(<PersonaTaxBadge personaId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(mock.builders).toHaveLength(0);
  });
});
