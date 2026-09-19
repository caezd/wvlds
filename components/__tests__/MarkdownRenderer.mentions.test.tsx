import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MarkdownContent } from "@/components/MarkdownRenderer";
import type { WorldRoleRow } from "@/lib/worldPermissions";

const ROLES: WorldRoleRow[] = [
  { id: "mj", world_id: "w1", name: "Maître du jeu", color: "#3b82f6", lucide_icon: null, position: 10, permissions: [], is_default: false, mentionable: true, hoist: false },
];

describe("MarkdownContent — mentions", () => {
  it("rend un rôle en puce à sa couleur, un pseudo et @tous en puces aussi", () => {
    render(<MarkdownContent content="Hé @Maître du jeu, @alice et @tous !" mentionRoles={ROLES} />);
    const role = screen.getByText("@Maître du jeu");
    expect(role.closest("[data-mention='role']")).not.toBeNull();
    expect((role.closest("[data-mention='role']") as HTMLElement).style.color).toBe("rgb(59, 130, 246)");
    expect(screen.getByText("@alice").closest("[data-mention='user']")).not.toBeNull();
    expect(screen.getByText("@tous").closest("[data-mention='all']")).not.toBeNull();
    // Aucun vrai lien : une mention ne mène nulle part.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("sans `mentionRoles` (wiki), un @ reste du texte", () => {
    const { container } = render(<MarkdownContent content="Voir @alice" />);
    expect(container.querySelector("[data-mention]")).toBeNull();
    expect(container).toHaveTextContent("Voir @alice");
  });

  it("un rôle supprimé depuis redevient du texte", () => {
    const { container } = render(<MarkdownContent content="[@Anciens](mention:role:disparu)" mentionRoles={ROLES} />);
    expect(container.querySelector("[data-mention]")).toBeNull();
    expect(container).toHaveTextContent("@Anciens");
  });

  it("ignore un @ dans du code inline", () => {
    const { container } = render(<MarkdownContent content="Tapez `@alice` pour l'appeler" mentionRoles={ROLES} />);
    expect(container.querySelector("[data-mention]")).toBeNull();
  });
});
