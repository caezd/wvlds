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

    const section = await screen.findByRole("region", { name: "Date dans la chronologie" });
    expect(within(section).getByLabelText("Mois")).toHaveDisplayValue("Dégel");

    await user.click(screen.getByRole("button", { name: "créer (double)" }));

    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatrooms")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ timeline_date: { year: 4, month: 1, day: null } }),
    );
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
