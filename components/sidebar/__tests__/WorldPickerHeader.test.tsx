import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldPickerHeader } from "@/components/sidebar/WorldPickerHeader";

const worldUnreadMock = vi.hoisted(() => ({ value: {} as Record<string, number> }));
vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ worldUnread: worldUnreadMock.value }),
}));

vi.mock("@/app/actions/worlds", () => ({
  leaveWorld: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

beforeEach(() => {
  worldUnreadMock.value = {};
});

const WORLDS = [
  { id: "world-1", name: "Alpha", icon_url: null, owner_id: "owner-1", is_favorite: false },
  { id: "world-2", name: "Bravo", icon_url: null, owner_id: "owner-2", is_favorite: true },
  { id: "world-3", name: "Charlie", icon_url: null, owner_id: "owner-3", is_favorite: false },
  { id: "world-4", name: "Delta", icon_url: null, owner_id: "owner-4", is_favorite: true },
];

function openDropdown() {
  fireEvent.click(screen.getByRole("button", { name: /switch/i }));
}

describe("WorldPickerHeader — favoris en tête de liste", () => {
  it("place les mondes favoris avant les autres, en conservant l'ordre relatif au sein de chaque groupe", () => {
    render(
      <WorldPickerHeader
        worlds={WORLDS}
        currentWorldId="world-1"
        currentUserId={null}
        plan="free"
        ownedCount={0}
        quotaLimit={1}
      />,
    );
    openDropdown();

    const names = screen.getAllByRole("button").map((b) => b.textContent).filter((t): t is string => !!t);
    const bravoIndex = names.findIndex((t) => t.includes("Bravo"));
    const deltaIndex = names.findIndex((t) => t.includes("Delta"));
    const charlieIndex = names.findIndex((t) => t.includes("Charlie"));

    // Bravo et Delta (favoris) passent avant Charlie (non favori) — l'ordre
    // Bravo avant Delta (celui de `worlds`) est conservé.
    expect(bravoIndex).toBeLessThan(charlieIndex);
    expect(deltaIndex).toBeLessThan(charlieIndex);
    expect(bravoIndex).toBeLessThan(deltaIndex);
  });

  it("affiche une étoile uniquement pour les mondes favoris", () => {
    render(
      <WorldPickerHeader
        worlds={WORLDS}
        currentWorldId="world-1"
        currentUserId={null}
        plan="free"
        ownedCount={0}
        quotaLimit={1}
      />,
    );
    openDropdown();

    const bravoRow = screen.getByText("Bravo").closest("button");
    const charlieRow = screen.getByText("Charlie").closest("button");

    // WorldAvatar (icon_url null) rend des initiales, pas de svg — seule
    // l'étoile des favoris ajoute un <svg> à la rangée.
    expect(bravoRow?.querySelectorAll("svg")).toHaveLength(1);
    expect(charlieRow?.querySelectorAll("svg")).toHaveLength(0);
  });
});
