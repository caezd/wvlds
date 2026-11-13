import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { WorldPickerHeader } from "@/components/sidebar/WorldPickerHeader";

const worldUnreadMock = vi.hoisted(() => ({ value: {} as Record<string, number> }));
const notificationsMock = vi.hoisted(() => ({ value: [] as { id: string; world_id: string | null }[] }));
const markWorldReadMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({
    worldUnread: worldUnreadMock.value,
    notifications: notificationsMock.value,
    markWorldRead: markWorldReadMock,
  }),
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
  notificationsMock.value = [];
  markWorldReadMock.mockReset().mockResolvedValue(true);
  vi.mocked(toast.error).mockClear();
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

describe("WorldPickerHeader — marquer un monde comme lu", () => {
  function renderPicker(currentUserId: string | null = "owner-1") {
    render(
      <WorldPickerHeader
        worlds={WORLDS}
        currentWorldId="world-1"
        currentUserId={currentUserId}
        plan="free"
        ownedCount={0}
        quotaLimit={1}
      />,
    );
  }

  it("propose « Marquer comme lu » au clic droit d'un monde non lu, et le marque", async () => {
    worldUnreadMock.value = { "world-3": 150 };
    renderPicker();
    openDropdown();

    fireEvent.contextMenu(screen.getByText("Charlie"));
    const item = screen.getByRole("menuitem", { name: "markRead" });
    expect(item).not.toHaveAttribute("aria-disabled", "true");

    fireEvent.click(item);
    await waitFor(() => expect(markWorldReadMock).toHaveBeenCalledWith("world-3"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("grise l'action quand le monde n'a rien à lire", () => {
    renderPicker();
    openDropdown();

    fireEvent.contextMenu(screen.getByText("Charlie"));
    const item = screen.getByRole("menuitem", { name: "markRead" });
    expect(item).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(item);
    expect(markWorldReadMock).not.toHaveBeenCalled();
  });

  it("une notification du monde suffit à activer l'action", () => {
    notificationsMock.value = [{ id: "n1", world_id: "world-3" }];
    renderPicker();
    openDropdown();

    fireEvent.contextMenu(screen.getByText("Charlie"));
    expect(screen.getByRole("menuitem", { name: "markRead" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("le menu existe aussi pour un monde dont on est propriétaire, sans l'option Quitter", () => {
    worldUnreadMock.value = { "world-3": 2 };
    renderPicker("owner-3");
    openDropdown();

    fireEvent.contextMenu(screen.getByText("Charlie"));
    expect(screen.getByRole("menuitem", { name: "markRead" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "leave" })).not.toBeInTheDocument();
  });

  it("le monde courant (bouton du sélecteur) a la même action", async () => {
    worldUnreadMock.value = { "world-1": 4 };
    renderPicker();

    fireEvent.contextMenu(screen.getByRole("button", { name: /switch/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "markRead" }));
    await waitFor(() => expect(markWorldReadMock).toHaveBeenCalledWith("world-1"));
  });

  it("signale l'échec par un toast", async () => {
    worldUnreadMock.value = { "world-3": 1 };
    markWorldReadMock.mockResolvedValue(false);
    renderPicker();
    openDropdown();

    fireEvent.contextMenu(screen.getByText("Charlie"));
    fireEvent.click(screen.getByRole("menuitem", { name: "markRead" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("markReadError"));
  });
});
