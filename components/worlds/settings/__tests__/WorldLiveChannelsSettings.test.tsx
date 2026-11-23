import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { LiveChannel } from "@/lib/worldLiveChannels";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const initial = vi.hoisted(() => ({ channels: [] as LiveChannel[] }));
vi.mock("@/hooks/useLiveChannels", async () => {
  const React = await import("react");
  return {
    useLiveChannels: () => {
      const [channels, setChannels] = React.useState<LiveChannel[] | null>(initial.channels);
      return { channels, setChannels };
    },
  };
});
vi.mock("@/components/ui/LucideIconPicker", () => ({
  LucideIconPicker: ({ trigger, onChange }: { trigger: React.ReactNode; onChange: (n: string) => void }) => (
    <span>
      {trigger}
      <button type="button" onClick={() => onChange("coffee")}>choisir café</button>
    </span>
  ),
}));
vi.mock("@/components/ui/LazyLucideIcon", () => ({ LazyLucideIcon: ({ name }: { name: string }) => <svg data-icon={name} /> }));

import { WorldLiveChannelsSettings } from "../WorldLiveChannelsSettings";

const salle = (id: string, name: string, sort_index: number, extra: Partial<LiveChannel> = {}): LiveChannel => ({
  id, world_id: "w1", name, color: null, icon: null, sort_index, ...extra,
});

let mock: SupabaseMock;
function monter(results: { data?: unknown; error?: unknown }[] = []) {
  mock = createSupabaseMock({ results: results as never });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return render(<WorldLiveChannelsSettings worldId="w1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  initial.channels = [salle("c1", "Hors-jeu", 0, { color: "#ff8800", icon: "coffee" }), salle("c2", "Aide", 1)];
});

describe("WorldLiveChannelsSettings", () => {
  it("la salle principale en tête, figée ; puis les salles du monde", () => {
    monter();
    expect(screen.getByTestId("live-channel-main")).toHaveTextContent("Général");
    const noms = screen.getAllByRole("textbox", { name: "Nom de la salle" }).map((i) => (i as HTMLInputElement).value);
    expect(noms).toEqual(["Hors-jeu", "Aide"]);
    // « # » sans icône ; l'icône choisie sinon.
    const icones = screen.getAllByTestId("live-channel-icon");
    expect(icones[0].querySelector("[data-icon=coffee]")).not.toBeNull();
    expect(icones[1].querySelector("[data-icon]")).toBeNull();
  });

  it("ajoute une salle à la fin", async () => {
    monter([{ data: salle("c3", "Annonces", 2) }]);
    await userEvent.type(screen.getByRole("textbox", { name: "Nouvelle salle…" }), "Annonces{Enter}");
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[0].insert).toHaveBeenCalledWith({
      world_id: "w1", name: "Annonces", color: null, sort_index: 2,
    }));
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Nom de la salle" })).toHaveLength(3));
  });

  it("renomme à la sortie du champ, change l'icône et revient au #", async () => {
    monter([{ data: null }, { data: null }, { data: null }]);
    const nom = screen.getAllByRole("textbox", { name: "Nom de la salle" })[1];
    await userEvent.clear(nom);
    await userEvent.type(nom, "Entraide");
    await userEvent.tab();
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[0].update).toHaveBeenCalledWith({ name: "Entraide" }));

    await userEvent.click(screen.getAllByRole("button", { name: "choisir café" })[1]);
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[1].update).toHaveBeenCalledWith({ icon: "coffee" }));
    await userEvent.click(screen.getByRole("button", { name: "Revenir au # pour la salle Hors-jeu" }));
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[2].update).toHaveBeenCalledWith({ icon: null }));
  });

  it("réordonne en une requête", async () => {
    monter();
    mock.client.rpc.mockResolvedValue({ data: 2, error: null });
    await userEvent.click(screen.getAllByRole("button", { name: "Déplacer vers le bas" })[0]);
    expect(mock.client.rpc).toHaveBeenCalledWith("reorder_world_live_channels", {
      p_items: [{ id: "c2", sort_index: 0 }, { id: "c1", sort_index: 1 }],
    });
    const noms = screen.getAllByRole("textbox", { name: "Nom de la salle" }).map((i) => (i as HTMLInputElement).value);
    expect(noms).toEqual(["Aide", "Hors-jeu"]);
  });

  it("supprime après confirmation, en prévenant que les messages partent avec", async () => {
    monter([{ data: null }]);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer la salle Aide" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("avec tous ses messages");
    await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[0].delete).toHaveBeenCalled());
    expect(mock.buildersFor("world_live_channels")[0].eq).toHaveBeenCalledWith("id", "c2");
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Nom de la salle" })).toHaveLength(1));
  });
});
