import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

import { createSupabaseMock } from "@/test/supabaseMock";

let mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => mock.client }));
vi.mock("@/components/ui/LazyLucideIcon", () => ({ LazyLucideIcon: ({ name }: { name: string }) => <svg data-icon={name} /> }));

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
    expect(mock.builders[0].builder.select).toHaveBeenCalledWith("persona_id, periods, badge_label, badge_color, badge_icon");
    expect(screen.getAllByText("Impayé")[0].closest("[title]")).toHaveAttribute("title", "2 périodes de taxe impayées");
  });

  it("le texte choisi par le monde ; compact : l'icône seule, nommée", async () => {
    mock = createSupabaseMock({ results: [{ data: [{ persona_id: "p1", periods: 1, badge_label: "Fauché" }] }] });
    render(<PersonaTaxBadge personaId="p1" compact />);
    expect(await screen.findByLabelText("Fauché")).toBeInTheDocument();
    expect(screen.queryByText("Fauché")).toBeNull();
  });

  it("la couleur et l'icône choisies par le monde", async () => {
    mock = createSupabaseMock({
      results: [{ data: [{ persona_id: "p1", periods: 1, badge_label: null, badge_color: "#5fcf5a", badge_icon: "skull" }] }],
    });
    render(<PersonaTaxBadge personaId="p1" />);
    const badge = (await screen.findByText("Impayé")).closest("[data-tax-overdue]") as HTMLElement;
    expect(badge).toHaveStyle({ color: "#5fcf5a" });
    expect(badge.querySelector('[data-icon="skull"]')).not.toBeNull();
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
