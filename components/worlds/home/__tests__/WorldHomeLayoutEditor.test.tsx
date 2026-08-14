import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { WorldHomeLayoutEditor } from "@/components/worlds/home/WorldHomeLayoutEditor";

function setup(results: Array<{ data?: unknown; error?: unknown }> = [{ error: null }]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldHomeLayoutEditor", () => {
  it("affiche un libellé par widget activé, dans l'ordre fourni", () => {
    setup();
    render(
      <WorldHomeLayoutEditor worldId="w1" layout={["chatrooms", "composer"]} onLayoutChange={vi.fn()} />,
    );
    expect(screen.getByText("Salons")).toBeInTheDocument();
    expect(screen.getByText("Créer une partie")).toBeInTheDocument();
  });

  it("ne propose d'ajouter que les widgets non déjà actifs", async () => {
    setup();
    const user = userEvent.setup();
    render(
      <WorldHomeLayoutEditor worldId="w1" layout={["chatrooms", "composer"]} onLayoutChange={vi.fn()} />,
    );
    await user.click(screen.getByText("Ajouter un widget"));

    expect(screen.getByRole("menuitem", { name: "Catégories" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Statistiques" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Membres en ligne" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Salons" })).not.toBeInTheDocument();
  });

  it("ajoute un widget à la fin de la liste et persiste", async () => {
    const mock = setup();
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeLayoutEditor worldId="w1" layout={["chatrooms"]} onLayoutChange={onLayoutChange} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Statistiques" }));

    expect(onLayoutChange).toHaveBeenCalledWith(["chatrooms", "stats"]);
    expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ home_layout: ["chatrooms", "stats"] });
    expect(mock.buildersFor("worlds")[0].eq).toHaveBeenCalledWith("id", "w1");
  });

  it("retire un widget et persiste", async () => {
    const mock = setup();
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorldHomeLayoutEditor worldId="w1" layout={["chatrooms", "composer"]} onLayoutChange={onLayoutChange} />,
    );

    const row = screen.getByText("Salons").closest("div")!;
    await user.click(row.querySelector("button")!);

    expect(onLayoutChange).toHaveBeenCalledWith(["composer"]);
    expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ home_layout: ["composer"] });
  });

  it("annule le changement optimiste et affiche une erreur si la persistance échoue", async () => {
    setup([{ error: { message: "boom" } }]);
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeLayoutEditor worldId="w1" layout={["chatrooms"]} onLayoutChange={onLayoutChange} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Statistiques" }));

    expect(onLayoutChange).toHaveBeenNthCalledWith(1, ["chatrooms", "stats"]);
    expect(onLayoutChange).toHaveBeenNthCalledWith(2, ["chatrooms"]);
    expect(toast.error).toHaveBeenCalledWith("boom");
  });

  it("affiche le message d'état vide quand aucun widget n'est actif", () => {
    setup();
    render(<WorldHomeLayoutEditor worldId="w1" layout={[]} onLayoutChange={vi.fn()} />);
    expect(screen.getByText("Aucun widget affiché — ajoutez-en un ci-dessous.")).toBeInTheDocument();
  });
});
