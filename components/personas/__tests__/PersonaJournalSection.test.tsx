import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";
import type { WorldTimelineConfig } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const me = vi.hoisted(() => ({ userId: "me" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: me.userId, username: "moi", plan: "free" }) }));
const membership = vi.hoisted(() => ({ canPlayNpc: false }));
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({ worldId: "w1", can: (perm: string) => perm === "npc.play" && membership.canPlayNpc }),
}));
const flags = vi.hoisted(() => ({ world_timeline: true }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => flags }));
vi.mock("@/components/MarkdownRenderer", () => ({ default: ({ content }: { content: string }) => <p>{content}</p> }));
// Le dialogue de confirmation, sous un tiroir déjà ouvert, boucle sur le focus en jsdom.
vi.mock("@/components/ui/delete-confirm-dialog", () => ({
  DeleteConfirmDialog: ({ trigger, onConfirm }: { trigger: React.ReactElement<{ onClick?: () => void }>; onConfirm: () => void }) => (
    <span onClick={onConfirm}>{trigger}</span>
  ),
}));

import { PersonaJournalSection, sortJournalEntries } from "@/components/personas/PersonaJournalSection";

const CONFIG: WorldTimelineConfig = { year_label: "An", era_name: null, month_names: ["Germinal", "Floréal"], days_per_month: [30, 30] };
const ENTRIES = [
  { id: "e1", persona_id: "p1", world_id: "w1", author_id: "me", body: "Arrivée au port.", timeline_date: { year: 1327, month: 1, day: 3 }, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z", author: { username: "moi" } },
  { id: "e2", persona_id: "p1", world_id: "w1", author_id: "me", body: "Sans date.", timeline_date: null, created_at: "2026-09-03T10:00:00Z", updated_at: "2026-09-03T10:00:00Z", author: { username: "moi" } },
  { id: "e3", persona_id: "p1", world_id: "w1", author_id: "me", body: "La veille du départ.", timeline_date: { year: 1326, month: null, day: null }, created_at: "2026-09-02T10:00:00Z", updated_at: "2026-09-02T10:00:00Z", author: { username: "moi" } },
];

/** Ordre des `.from()` : worlds (chronologie) puis persona_journal_entries. */
function setup(entries: unknown[] = ENTRIES, timelineEnabled = true, extra: { data: unknown }[] = []) {
  const mock = createSupabaseMock({
    results: [
      { data: { timeline_enabled: timelineEnabled, timeline_config: timelineEnabled ? CONFIG : null } },
      { data: entries },
      ...extra,
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); me.userId = "me"; membership.canPlayNpc = false; flags.world_timeline = true; });

describe("sortJournalEntries", () => {
  it("chronologie active : les datées de la plus récente à la plus ancienne, puis les autres", () => {
    expect(sortJournalEntries(ENTRIES, true).map((e) => e.id)).toEqual(["e1", "e3", "e2"]);
  });
  it("sans chronologie : l'ordre d'écriture, du plus récent au plus ancien", () => {
    expect(sortJournalEntries(ENTRIES, false).map((e) => e.id)).toEqual(["e2", "e3", "e1"]);
  });
});

describe("PersonaJournalSection", () => {
  it("le propriétaire voit ses entrées datées dans la chronologie du monde et peut en écrire", async () => {
    setup();
    render(<PersonaJournalSection personaId="p1" worldId="w1" ownerId="me" />);
    await screen.findByText("Arrivée au port.");
    expect(screen.getByText("3 Floréal, An 1327")).toBeInTheDocument();
    expect(screen.getByText("An 1326")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Arrivée au port.")).toBeInTheDocument();
    expect(within(items[2]).getByText("Sans date.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouvelle entrée" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Modifier cette entrée" })).toHaveLength(3);
  });

  it("un autre membre lit sans écrire", async () => {
    me.userId = "other";
    setup();
    render(<PersonaJournalSection personaId="p1" worldId="w1" ownerId="me" />);
    await screen.findByText("Arrivée au port.");
    expect(screen.queryByRole("button", { name: "Nouvelle entrée" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifier cette entrée" })).toBeNull();
  });

  it("un PNJ s'écrit avec « Jouer les PNJ », et chaque entrée nomme sa plume", async () => {
    me.userId = "other";
    membership.canPlayNpc = true;
    setup([ENTRIES[0]]);
    render(<PersonaJournalSection personaId="p1" worldId="w1" ownerId="me" isNpc />);
    await screen.findByText("Arrivée au port.");
    expect(screen.getByText("· @moi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouvelle entrée" })).toBeInTheDocument();
  });

  it("écrit une entrée datée puis recharge la liste", async () => {
    const mock = setup([], true, [{ data: null }, { data: [ENTRIES[0]] }]);
    const user = userEvent.setup();
    render(<PersonaJournalSection personaId="p1" worldId="w1" ownerId="me" />);
    await screen.findByText("Votre journal est encore vierge : racontez la première journée.");

    await user.click(screen.getByRole("button", { name: "Nouvelle entrée" }));
    const save = screen.getByRole("button", { name: "Enregistrer" });
    expect(save).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Ce que le persona retient de la journée…" }), "Arrivée au port.");
    await user.type(screen.getByRole("spinbutton", { name: "Date dans le monde" }), "1327");
    await user.click(save);

    await waitFor(() => expect(mock.client.from).toHaveBeenCalledWith("persona_journal_entries"));
    const insert = mock.buildersFor("persona_journal_entries")[1].insert;
    expect(insert).toHaveBeenCalledWith({ persona_id: "p1", world_id: "w1", author_id: "me", body: "Arrivée au port.", timeline_date: { year: 1327, month: null, day: null } });
    await screen.findByText("Arrivée au port.");
  });

  it("sans chronologie dans le monde, pas de champ de date et l'ordre d'écriture", async () => {
    setup(ENTRIES, false);
    const user = userEvent.setup();
    render(<PersonaJournalSection personaId="p1" worldId="w1" ownerId="me" />);
    await screen.findByText("Arrivée au port.");
    expect(screen.queryByText("3 Floréal, An 1327")).toBeNull();
    expect(within(screen.getAllByRole("listitem")[0]).getByText("Sans date.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nouvelle entrée" }));
    expect(screen.queryByRole("spinbutton", { name: "Date dans le monde" })).toBeNull();
  });

  it("supprime une entrée après confirmation", async () => {
    const mock = setup([ENTRIES[1]]);
    const user = userEvent.setup();
    render(<PersonaJournalSection personaId="p1" worldId="w1" ownerId="me" />);
    await screen.findByText("Sans date.");
    await user.click(screen.getByRole("button", { name: "Supprimer cette entrée" }));
    await waitFor(() => expect(screen.queryByText("Sans date.")).toBeNull());
    expect(mock.buildersFor("persona_journal_entries")[1].delete).toHaveBeenCalled();
  });
});
