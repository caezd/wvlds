import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => ({ world_map: false }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

// Le compositeur réel a ses propres tests : ici, un double qui crée le salon
// (`onResolveChat`) et peut retirer la date, comme le ferait son option.
vi.mock("@/components/chatrooms/composer/ChatroomComposer", () => ({
  ChatroomComposer: (props: {
    onResolveChat: () => Promise<unknown>;
    onTimelineDateChange: (d: WorldTimelineDate | null) => void;
  }) => (
    <div data-testid="composer-stub">
      <button type="button" onClick={() => void props.onResolveChat()}>créer (double)</button>
      <button type="button" onClick={() => props.onTimelineDateChange(null)}>retirer la date (double)</button>
    </div>
  ),
}));

import { WorldChatComposer } from "@/components/worlds/chatrooms/WorldChatComposer";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: null,
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 4,
  current_month: 1,
};

function setup() {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [{ data: [] }, { data: { id: "c-neuf" } }],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe("WorldChatComposer — date exigée à la création", () => {
  it("sans l'exigence, pas de section de date sous le titre", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={CONFIG} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    await screen.findByTestId("composer-stub");
    expect(screen.queryByRole("region", { name: "Date dans la chronologie" })).toBeNull();
  });

  it("exigée : la section s'ouvre sur la date actuelle du récit, et le salon naît daté", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await user.click(screen.getByText(/Nouveau jeu/i));

    // Le titre du dialogue parle de jeu, et la ligne de date se contente d'une
    // icône : son nom reste lisible par les lecteurs d'écran.
    expect(screen.getByRole("heading", { name: "Nouveau jeu" })).toBeInTheDocument();
    const section = await screen.findByRole("region", { name: "Date dans la chronologie" });
    expect(section).not.toHaveTextContent("Date dans la chronologie");
    expect(within(section).getByLabelText("Mois")).toHaveDisplayValue("Dégel");

    await user.click(screen.getByRole("button", { name: "créer (double)" }));

    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatrooms")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ timeline_date: { year: 4, month: 1, day: null } }),
    );
  });

  it("dans le dialogue, la date se tient à droite du titre", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await user.click(screen.getByText(/Nouveau jeu/i));

    const section = await screen.findByRole("region", { name: "Date dans la chronologie" });
    const titre = screen.getByPlaceholderText("Titre de la conversation");
    // Même ligne : le titre et la date partagent leur conteneur flex.
    expect(section.parentElement).toBe(titre.parentElement?.parentElement);
  });

  it("effacer puis tirer au hasard : les deux boutons dans le champ du titre", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={CONFIG} />);
    await user.click(screen.getByText(/Nouveau jeu/i));

    const titre = screen.getByPlaceholderText("Titre de la conversation");
    const champ = titre.parentElement!;
    const effacer = within(champ).getByRole("button", { name: "Effacer le titre" });
    const hasard = within(champ).getByRole("button", { name: "Générer un titre aléatoire" });
    // Le hasard à droite de la croix.
    expect(effacer.compareDocumentPosition(hasard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(effacer);
    expect(titre).toHaveValue("");
    // Sans titre, la croix s'efface mais le hasard reste.
    await user.click(within(champ).getByRole("button", { name: "Générer un titre aléatoire" }));
    expect(titre).not.toHaveValue("");
  });

  it("sur mobile, la date passe sous le titre", async () => {
    setup();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await user.click(screen.getByText(/Nouveau jeu/i));

    const section = await screen.findByRole("region", { name: "Date dans la chronologie" });
    const titre = screen.getByPlaceholderText("Titre de la conversation");
    expect(section.parentElement).not.toBe(titre.parentElement?.parentElement);
    // Placée après la ligne du titre.
    expect(titre.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("exigée : sans date, le salon n'est pas créé", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    await screen.findByTestId("composer-stub");

    await user.click(screen.getByRole("button", { name: "retirer la date (double)" }));
    await user.click(screen.getByRole("button", { name: "créer (double)" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Ce monde exige une date pour chaque nouveau salon."));
    expect(mock.buildersFor("chatrooms")).toHaveLength(0);
  });

  it("exigée et restreinte : la date est celle de la période en cours", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={{ ...CONFIG, require_date: true, restrict_to_current: true }} />);
    await user.click(screen.getByText(/Nouveau jeu/i));

    const section = await screen.findByRole("region", { name: "Date dans la chronologie" });
    expect(within(section).getByTestId("timeline-period-lock")).toHaveTextContent("Dégel, an 4");
    // Figés : ni champ d'année ni liste de mois.
    expect(within(section).queryByRole("combobox")).toBeNull();
  });
});
