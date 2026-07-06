import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/(protected)/p/actions", () => ({
  movePersona: vi.fn(),
  duplicatePersona: vi.fn(),
}));
// La carte réelle embarque la fiche d'édition complète (supabase, feature
// flags…) — hors sujet ici, on ne teste que la vue.
vi.mock("@/components/personas/PersonaCard", () => ({
  PersonaCard: ({ personaName }: { personaName: string }) => (
    <div data-testid="persona-card">{personaName}</div>
  ),
}));

import {
  PersonasView,
  type PersonaWorldGroup,
} from "@/components/personas/PersonasView";

function persona(id: string, name: string, worldId: string | null) {
  return {
    id,
    name,
    avatar_url: null,
    avatar_config: null,
    avatar_frame_id: null,
    frame_asset_url: null,
    banner_url: null,
    world_id: worldId,
    sections: [],
  };
}

const groups: PersonaWorldGroup[] = [
  {
    worldId: "w1",
    worldName: "Aetheria",
    personas: [persona("p2", "Zora", "w1"), persona("p1", "Caelan", "w1")],
  },
  {
    worldId: "w2",
    worldName: "Terra Nova",
    personas: [persona("p3", "Milo", "w2")],
  },
];

beforeEach(() => vi.clearAllMocks());

describe("PersonasView — vue par monde", () => {
  it("affiche les groupes par monde avec leurs personas", () => {
    render(<PersonasView groups={groups} />);
    expect(screen.getByText("Aetheria")).toBeInTheDocument();
    expect(screen.getByText("Terra Nova")).toBeInTheDocument();
    expect(screen.getAllByTestId("persona-card")).toHaveLength(3);
  });

  it("expose toujours une section « Sans monde » comme zone de dépôt", () => {
    render(<PersonasView groups={groups} />);
    expect(screen.getByText("Sans monde")).toBeInTheDocument();
    expect(screen.getByText("Dépose un persona ici")).toBeInTheDocument();
  });

  it("affiche les zones de dépôt même sans aucun persona (nouveau membre)", () => {
    render(
      <PersonasView
        groups={[{ worldId: "w9", worldName: "Nouveau monde", personas: [] }]}
      />,
    );
    expect(screen.getByText("Nouveau monde")).toBeInTheDocument();
    // Monde vide + « Sans monde » (ajouté automatiquement)
    expect(screen.getAllByText("Dépose un persona ici")).toHaveLength(2);
  });

  it("affiche un monde sans persona avec sa zone de dépôt", () => {
    render(
      <PersonasView
        groups={[...groups, { worldId: "w3", worldName: "Monde vide", personas: [] }]}
      />,
    );
    expect(screen.getByText("Monde vide")).toBeInTheDocument();
    // Monde vide + « Sans monde » (ajouté automatiquement)
    expect(screen.getAllByText("Dépose un persona ici")).toHaveLength(2);
  });

  it("affiche « x / limite » en plan gratuit, juste le compte sinon", () => {
    const { unmount } = render(
      <PersonasView groups={groups} personaLimit={5} />,
    );
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    unmount();

    render(<PersonasView groups={groups} />);
    expect(screen.queryByText("2 / 5")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("PersonasView — vue alphabétique", () => {
  it("trie les personas tous mondes confondus et affiche leur monde", async () => {
    const user = userEvent.setup();
    render(<PersonasView groups={groups} />);
    await user.click(screen.getByRole("tab", { name: "Alphabétique" }));

    const names = screen
      .getAllByTestId("persona-card")
      .map((el) => el.textContent);
    expect(names).toEqual(["Caelan", "Milo", "Zora"]);

    // Libellé du monde sous chaque carte
    expect(screen.getByText("Terra Nova")).toBeInTheDocument();
    expect(screen.getAllByText("Aetheria")).toHaveLength(2);
  });
});
