import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { World } from "@/types/worlds";
import type { WorldHomeGridGap } from "@/components/worlds/home/worldHomeGrid";

const setWorldHomeShowStatsMock = vi.fn();
const setWorldHomeGridGapMock = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldHomeShowStats: (...args: unknown[]) => setWorldHomeShowStatsMock(...args),
  setWorldHomeGridGap: (...args: unknown[]) => setWorldHomeGridGapMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const editorGapProp = vi.fn();
vi.mock("@/components/worlds/home/WorldHomeGridEditor", () => ({
  WorldHomeGridEditor: (props: { gap?: WorldHomeGridGap }) => {
    editorGapProp(props.gap);
    return <div data-testid="editor-stub" />;
  },
}));

import { toast } from "sonner";
import { WorldHomeGridSettings } from "@/components/worlds/settings/WorldHomeGridSettings";

const BASE_WORLD: World = {
  id: "w1",
  name: "Veldis",
  home_show_stats: false,
  home_grid_gap: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldHomeGridSettings — espacement de la grille", () => {
  it("propose les trois préréglages, « comfortable » sélectionné par défaut", () => {
    render(<WorldHomeGridSettings world={BASE_WORLD} />);
    const group = screen.getByRole("radiogroup", { name: "Espacement des blocs" });
    expect(within(group).getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "false");
    expect(within(group).getByRole("radio", { name: "Confortable" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Spacieux" })).toHaveAttribute("aria-checked", "false");
    // Transmis tel quel à l'éditeur — même valeur des deux côtés.
    expect(editorGapProp).toHaveBeenCalledWith("comfortable");
  });

  it("respecte le préréglage déjà enregistré", () => {
    render(<WorldHomeGridSettings world={{ ...BASE_WORLD, home_grid_gap: "spacious" }} />);
    expect(screen.getByRole("radio", { name: "Spacieux" })).toHaveAttribute("aria-checked", "true");
    expect(editorGapProp).toHaveBeenCalledWith("spacious");
  });

  it("change de préréglage, persiste, et prévient le parent", async () => {
    setWorldHomeGridGapMock.mockResolvedValue({ ok: true });
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeGridSettings world={BASE_WORLD} onUpdated={onUpdated} />);

    await user.click(screen.getByRole("radio", { name: "Compact" }));

    expect(setWorldHomeGridGapMock).toHaveBeenCalledWith("w1", "compact");
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "true");
    });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ home_grid_gap: "compact" }));
  });

  it("annule le changement optimiste et affiche une erreur si la persistance échoue", async () => {
    setWorldHomeGridGapMock.mockResolvedValue({ ok: false, error: "saveFailed" });
    const user = userEvent.setup();
    render(<WorldHomeGridSettings world={BASE_WORLD} />);

    await user.click(screen.getByRole("radio", { name: "Spacieux" }));

    // Le code renvoyé par l'action est traduit avant affichage : « nope »
    // n'est pas un code connu, il retombe sur le message générique.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("L'enregistrement a échoué"),
    );
    // Retombe sur la sélection d'avant l'échec.
    expect(screen.getByRole("radio", { name: "Confortable" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Spacieux" })).toHaveAttribute("aria-checked", "false");
  });

  it("ne fait rien en recliquant sur le préréglage déjà actif", async () => {
    const user = userEvent.setup();
    render(<WorldHomeGridSettings world={BASE_WORLD} />);
    await user.click(screen.getByRole("radio", { name: "Confortable" }));
    expect(setWorldHomeGridGapMock).not.toHaveBeenCalled();
  });
});

describe("WorldHomeGridSettings — statistiques", () => {
  it("garde le comportement existant (case à cocher) inchangé par cet ajout", async () => {
    setWorldHomeShowStatsMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<WorldHomeGridSettings world={BASE_WORLD} />);
    await user.click(screen.getByRole("switch"));
    expect(setWorldHomeShowStatsMock).toHaveBeenCalledWith("w1", true);
  });
});
