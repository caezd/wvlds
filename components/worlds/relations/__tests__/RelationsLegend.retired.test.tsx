import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RelationsLegend } from "@/components/worlds/relations/RelationsLegend";
import { PersonaCard } from "@/components/worlds/relations/PersonaCard";
import type { CGroup, CRelType } from "@/components/worlds/relations/types";

const TYPES: CRelType[] = [{ id: "t1", name: "Allié", color: "#0f0", dash: "", sort_index: 0, mutual: false, marital_status: null }];
const GROUPS: CGroup[] = [];

describe("RelationsLegend — personas retirés", () => {
  it("n'affiche le bouton que quand le monde en compte, et le bascule", () => {
    const onToggleRetired = vi.fn();
    const { rerender } = render(
      <RelationsLegend relTypes={TYPES} groups={GROUPS} hiddenTypes={new Set()} hiddenGroups={new Set()} onToggleType={() => {}} onToggleGroup={() => {}} onReset={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /retirés et décédés/ })).toBeNull();

    rerender(
      <RelationsLegend relTypes={TYPES} groups={GROUPS} hiddenTypes={new Set()} hiddenGroups={new Set()} onToggleType={() => {}} onToggleGroup={() => {}} onReset={() => {}} hideRetired={false} onToggleRetired={onToggleRetired} />,
    );
    const button = screen.getByRole("button", { name: "Masquer les retirés et décédés" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onToggleRetired).toHaveBeenCalledOnce();
  });

  it("une fois masqués, propose de les réafficher et « tout afficher » apparaît", () => {
    const onReset = vi.fn();
    render(
      <RelationsLegend relTypes={TYPES} groups={GROUPS} hiddenTypes={new Set()} hiddenGroups={new Set()} onToggleType={() => {}} onToggleGroup={() => {}} onReset={onReset} hideRetired onToggleRetired={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Afficher les retirés et décédés" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Tout afficher" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

describe("relations/PersonaCard — statut narratif", () => {
  const persona = { id: "p1", name: "Nyx", avatar_url: null, user_id: "u1", narrative_status: "dead" as const };

  it("grise un persona décédé et pose le badge dans le coin", () => {
    render(<PersonaCard persona={persona} onSelect={() => {}} />);
    const card = screen.getByRole("button", { name: "Nyx" });
    expect(card.className).toContain("grayscale");
    expect(card.querySelector("[data-narrative-status='dead']")).not.toBeNull();
  });

  it("laisse un vivant intact", () => {
    render(<PersonaCard persona={{ ...persona, narrative_status: "alive" }} onSelect={() => {}} />);
    const card = screen.getByRole("button", { name: "Nyx" });
    expect(card.className).not.toContain("grayscale");
    expect(card.querySelector("[data-narrative-status]")).toBeNull();
  });
});
