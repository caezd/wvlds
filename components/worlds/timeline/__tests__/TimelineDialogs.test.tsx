import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));

import { TimelineArcsDialog } from "@/components/worlds/timeline/TimelineArcsDialog";
import { TimelineEventDialog } from "@/components/worlds/timeline/TimelineEventDialog";

// Un faux client qui note chaque écriture et répond sans erreur.
const writes: { table: string; op: string; payload?: unknown; eq?: unknown[] }[] = [];
function fakeClient(tables: Record<string, unknown[]> = {}) {
  function builder(table: string) {
    const entry: { table: string; op: string; payload?: unknown; eq?: unknown[] } = { table, op: "select" };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "not", "is"]) b[m] = () => b;
    b.eq = (...args: unknown[]) => { entry.eq = args; return b; };
    for (const op of ["insert", "update", "delete"]) {
      b[op] = (payload?: unknown) => { entry.op = op; entry.payload = payload; writes.push(entry); return b; };
    }
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
    return b;
  }
  return { from: (t: string) => builder(t) } as never;
}

const CONFIG: WorldTimelineConfig = {
  year_label: "An", era_name: null, month_names: ["Janvier", "Février"], current_year: 3, current_month: 1,
  restrict_to_current: true,
};

beforeEach(() => {
  writes.length = 0;
  toastError.mockReset();
});

describe("TimelineArcsDialog", () => {
  const ARCS = [{ id: "a1", name: "L'exil", color: "#22c55e", position: 0 }];

  it("ajoute un arc à la suite des autres", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<TimelineArcsDialog open onOpenChange={vi.fn()} supabase={fakeClient()} worldId="w1" arcs={ARCS} onChanged={onChanged} />);
    await user.type(screen.getByRole("textbox", { name: "Nouvel arc" }), "La crue");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(writes).toContainEqual(expect.objectContaining({
      table: "world_timeline_arcs", op: "insert",
      payload: { world_id: "w1", name: "La crue", color: "#94a3b8", position: 1 },
    }));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Nouvel arc" })).toHaveValue("");
  });

  it("renomme à la sortie du champ ; un nom vide reprend l'ancien", async () => {
    const user = userEvent.setup();
    render(<TimelineArcsDialog open onOpenChange={vi.fn()} supabase={fakeClient()} worldId="w1" arcs={ARCS} onChanged={vi.fn()} />);
    const nom = screen.getByRole("textbox", { name: "Nom de l'arc" });
    await user.clear(nom);
    await user.tab();
    expect(nom).toHaveValue("L'exil");
    expect(writes.filter((w) => w.op === "update")).toHaveLength(0);

    await user.clear(nom);
    await user.type(nom, "L'exil à l'est{Enter}");
    expect(writes).toContainEqual(expect.objectContaining({ op: "update", payload: { name: "L'exil à l'est" }, eq: ["id", "a1"] }));
  });

  it("la suppression se confirme d'un second clic", async () => {
    const user = userEvent.setup();
    render(<TimelineArcsDialog open onOpenChange={vi.fn()} supabase={fakeClient()} worldId="w1" arcs={ARCS} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Supprimer l'arc L'exil" }));
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(writes).toContainEqual(expect.objectContaining({ table: "world_timeline_arcs", op: "delete", eq: ["id", "a1"] }));
  });
});

describe("TimelineEventDialog", () => {
  it("un titre est exigé", async () => {
    const user = userEvent.setup();
    render(<TimelineEventDialog open onOpenChange={vi.fn()} supabase={fakeClient()} worldId="w1" config={CONFIG} event={null} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(toastError).toHaveBeenCalledWith("Donnez un titre à l'événement.");
    expect(writes).toHaveLength(0);
  });

  it("la date d'un événement échappe à la restriction à la période en cours", () => {
    render(<TimelineEventDialog open onOpenChange={vi.fn()} supabase={fakeClient()} worldId="w1" config={CONFIG} event={null} onSaved={vi.fn()} />);
    // L'année se choisit : pas de période figée.
    expect(screen.queryByTestId("timeline-period-lock")).toBeNull();
    expect(screen.getByLabelText("Numéro de l'année (An)")).toHaveValue(3);
  });

  it("modifier, lier une page du wiki, puis supprimer après confirmation", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const event = {
      kind: "event" as const, id: "e1", title: "Couronnement", description: null,
      date: { year: 3, month: 0, day: 2 }, wikiPageId: null, wikiPage: null,
    };
    render(
      <TimelineEventDialog
        open onOpenChange={onOpenChange} supabase={fakeClient({ world_wiki_pages: [{ id: "p1", title: "La reine" }] })}
        worldId="w1" config={CONFIG} event={event} onSaved={onSaved}
      />,
    );
    const dialogue = screen.getByRole("dialog", { name: "Modifier l'événement" });
    await user.selectOptions(await within(dialogue).findByRole("combobox", { name: "Page du wiki" }), "La reine");
    await user.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    expect(writes).toContainEqual(expect.objectContaining({
      table: "world_timeline_events", op: "update",
      payload: { title: "Couronnement", description: null, timeline_date: { year: 3, month: 0, day: 2 }, wiki_page_id: "p1" },
      eq: ["id", "e1"],
    }));
    expect(onSaved).toHaveBeenCalled();

    writes.length = 0;
    await user.click(within(dialogue).getByRole("button", { name: "Supprimer" }));
    expect(writes).toHaveLength(0);
    await user.click(within(dialogue).getByRole("button", { name: "Confirmer la suppression" }));
    expect(writes).toContainEqual(expect.objectContaining({ table: "world_timeline_events", op: "delete", eq: ["id", "e1"] }));
  });
});
