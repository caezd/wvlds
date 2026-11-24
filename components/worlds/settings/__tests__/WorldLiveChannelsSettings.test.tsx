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
  id, world_id: "w1", name, color: null, icon: null, sort_index, group_id: null, ...extra,
});

/** Les groupes de personas du monde, lus au montage (migration 243). */
const GROUPES = [
  { id: "maison", name: "Maison", description: null, color: "#ff0000", parent_id: null, sort_index: 0, apply_color: true },
  { id: "cadette", name: "Branche cadette", description: null, color: null, parent_id: "maison", sort_index: 0, apply_color: true },
];

let mock: SupabaseMock;
function monter(results: { data?: unknown; error?: unknown }[] = [], groupes: unknown[] = GROUPES) {
  mock = createSupabaseMock({ results: [{ data: groupes }, ...results] as never });
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
      world_id: "w1", name: "Annonces", color: null, sort_index: 2, group_id: null,
    }));
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Nom de la salle" })).toHaveLength(3));
  });

  it("une nouvelle salle peut être réservée à un groupe, sous-groupes compris (migration 243)", async () => {
    const user = userEvent.setup();
    monter([{ data: salle("c3", "Conseil", 2, { group_id: "cadette" }) }]);
    const choix = await screen.findByRole("button", { name: "Visibilité de la nouvelle salle" });
    expect(choix).toHaveTextContent("Tous les membres");
    await user.click(choix);
    const options = screen.getAllByRole("menuitemradio").map((o) => o.textContent);
    expect(options).toEqual(["Tous les membres", "Maison", "Maison › Branche cadette"]);
    await user.click(screen.getByRole("menuitemradio", { name: "Maison › Branche cadette" }));
    expect(choix).toHaveTextContent("Maison › Branche cadette");
    await user.type(screen.getByRole("textbox", { name: "Nouvelle salle…" }), "Conseil{Enter}");
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[0].insert).toHaveBeenCalledWith({
      world_id: "w1", name: "Conseil", color: null, sort_index: 2, group_id: "cadette",
    }));
    // Le choix revient à « Tous les membres » pour la salle suivante.
    await waitFor(() => expect(choix).toHaveTextContent("Tous les membres"));
  });

  it("le groupe d'une salle existante se change, ou se retire", async () => {
    const user = userEvent.setup();
    initial.channels = [salle("c1", "Hors-jeu", 0, { group_id: "maison" }), salle("c2", "Aide", 1)];
    monter([{ data: null }, { data: null }]);
    const choix = await screen.findByRole("button", { name: "Visibilité de la salle Hors-jeu" });
    expect(choix).toHaveTextContent("Maison");
    await user.click(choix);
    await user.click(screen.getByRole("menuitemradio", { name: "Tous les membres" }));
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[0].update).toHaveBeenCalledWith({ group_id: null }));
    expect(mock.buildersFor("world_live_channels")[0].eq).toHaveBeenCalledWith("id", "c1");

    await user.click(screen.getByRole("button", { name: "Visibilité de la salle Aide" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Maison" }));
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[1].update).toHaveBeenCalledWith({ group_id: "maison" }));
  });

  it("renomme à la sortie du champ et change l'icône", async () => {
    monter([{ data: null }, { data: null }]);
    const nom = screen.getAllByRole("textbox", { name: "Nom de la salle" })[1];
    await userEvent.clear(nom);
    await userEvent.type(nom, "Entraide");
    await userEvent.tab();
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[0].update).toHaveBeenCalledWith({ name: "Entraide" }));

    await userEvent.click(screen.getAllByRole("button", { name: "choisir café" })[1]);
    await waitFor(() => expect(mock.buildersFor("world_live_channels")[1].update).toHaveBeenCalledWith({ icon: "coffee" }));
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
