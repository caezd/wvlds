import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { WorldTimelineConfig } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => ({ world_map: false }) }));
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

// Le compositeur réel a ses propres tests : ici, un double qui crée le salon.
vi.mock("@/components/chatrooms/composer/ChatroomComposer", () => ({
  ChatroomComposer: (props: { onResolveChat: () => Promise<unknown> }) => (
    <div data-testid="composer-stub">
      <button type="button" onClick={() => void props.onResolveChat()}>créer (double)</button>
    </div>
  ),
}));

import { WorldChatComposer } from "@/components/worlds/chatrooms/WorldChatComposer";

const CONFIG: WorldTimelineConfig = {
  year_label: "An", era_name: null, month_names: ["Givre", "Dégel"], current_year: 4, current_month: 1,
};

const LINKABLE = [
  { id: "vieux", title: "Un vieux salon", timeline_date: { year: 1, month: 0, day: 1 }, mine: false, last_at: "2026-01-01T00:00:00Z" },
  { id: "recent", title: "Mon salon récent", timeline_date: { year: 3, month: null, day: null }, mine: true, last_at: "2026-09-01T00:00:00Z" },
  { id: "futur", title: "Un salon à venir", timeline_date: { year: 9, month: 0, day: 1 }, mine: true, last_at: "2026-09-10T00:00:00Z" },
];

function setup(sequelResult: { data?: unknown; error?: unknown } = { data: { status: "accepted" } }) {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    // Catégories, puis le salon créé, puis le lien de suite.
    results: [{ data: [] }, { data: { id: "c-neuf" } }, sequelResult],
  });
  mock.rpc.mockResolvedValue({ data: LINKABLE, error: null });
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

describe("WorldChatComposer — « Suite de… »", () => {
  it("propose les salons datés, ceux où l'on joue d'abord", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={CONFIG} />);
    await user.click(screen.getByText(/Nouveau jeu/i));

    const suite = await screen.findByRole("combobox", { name: "Suite de…" });
    const groupes = suite.querySelectorAll("optgroup");
    expect([...groupes].map((g) => g.getAttribute("label"))).toEqual(["Où vous jouez", "Autres salons"]);
    // Sans date encore, tous les salons datés.
    expect(within(groupes[0] as HTMLElement).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Un salon à venir", "Mon salon récent",
    ]);
    expect(suite).toHaveValue("");
  });

  it("une fois le salon daté, pas de suite d'un salon situé après lui", async () => {
    setup();
    const user = userEvent.setup();
    // La date exigée s'ouvre sur l'an 4 : le salon de l'an 9 n'est pas proposé.
    render(<WorldChatComposer worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    const suite = await screen.findByRole("combobox", { name: "Suite de…" });
    expect(within(suite).queryByRole("option", { name: "Un salon à venir" })).toBeNull();
    expect(within(suite).getByRole("option", { name: "Mon salon récent" })).toBeInTheDocument();
  });

  it("le salon naît relié à celui qu'il suit ; proposé, on est prévenu", async () => {
    const mock = setup({ data: { status: "pending" } });
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={CONFIG} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Suite de…" }), "Un vieux salon");
    await user.click(screen.getByRole("button", { name: "créer (double)" }));

    await waitFor(() => expect(mock.buildersFor("chatroom_sequels")).toHaveLength(1));
    expect(mock.buildersFor("chatroom_sequels")[0].insert).toHaveBeenCalledWith({
      world_id: "w1", chatroom_id: "c-neuf", previous_id: "vieux",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(
      "Salon créé. La suite est proposée : les participants de l'autre salon doivent l'accepter.",
    ));
  });

  it("sans choix, pas de lien", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={CONFIG} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    await screen.findByRole("combobox", { name: "Suite de…" });
    await user.click(screen.getByRole("button", { name: "créer (double)" }));
    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatroom_sequels")).toHaveLength(0);
  });

  it("un lien refusé n'empêche pas le salon d'exister", async () => {
    const mock = setup({ error: { message: "boucle" } });
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={CONFIG} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Suite de…" }), "Mon salon récent");
    await user.click(screen.getByRole("button", { name: "créer (double)" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      "Le salon est créé, mais pas le lien de suite : refaites-le depuis ses réglages.",
    ));
    expect(mock.buildersFor("chatrooms")).toHaveLength(1);
    erreur.mockRestore();
  });

  it("sans chronologie, pas de « Suite de… »", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" timelineConfig={null} />);
    await user.click(screen.getByText(/Nouveau jeu/i));
    await screen.findByTestId("composer-stub");
    expect(screen.queryByRole("combobox", { name: "Suite de…" })).toBeNull();
  });
});
