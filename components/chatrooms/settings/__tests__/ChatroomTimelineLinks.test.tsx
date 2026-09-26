import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

const toastError = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn(), info: toastInfo } }));

import { ChatroomTimelineLinks } from "@/components/chatrooms/settings/ChatroomTimelineLinks";

const CONFIG: WorldTimelineConfig = {
  year_label: "An", era_name: null, month_names: ["Janvier", "Février"], current_year: 1, current_month: 0,
};

// Un faux client : lectures par table, écritures notées ; l'insertion d'une
// suite renvoie le statut que la base aurait décidé.
let writeError: unknown = null;
let insertedStatus: "pending" | "accepted" = "accepted";
let sequels: { id: string; previous_id: string; status: string }[] = [];
const writes: { table: string; op: string; payload?: unknown; eq?: unknown[] }[] = [];
function fakeClient() {
  function builder(table: string) {
    const entry: { table: string; op: string; payload?: unknown; eq?: unknown[] } = { table, op: "select" };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "not", "maybeSingle"]) b[m] = () => b;
    b.eq = (...args: unknown[]) => { entry.eq = args; return b; };
    for (const op of ["insert", "update", "delete"]) {
      b[op] = (payload?: unknown) => { entry.op = op; entry.payload = payload; writes.push(entry); return b; };
    }
    b.then = (resolve: (v: unknown) => unknown) => {
      if (entry.op !== "select") {
        return Promise.resolve({ data: entry.op === "insert" ? { status: insertedStatus } : null, error: writeError }).then(resolve);
      }
      const data =
        table === "world_timeline_arcs" ? [{ id: "arc", name: "L'exil" }]
        : table === "chatroom_sequels" ? sequels
        : { arc_id: null };
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return b;
  }
  const rpc = () => Promise.resolve({
    data: [
      { id: "self", title: "Moi", timeline_date: { year: 2, month: 0, day: 1 }, mine: true, last_at: null },
      { id: "b", title: "La grande crue", timeline_date: { year: 1, month: 1, day: 3 }, mine: true, last_at: null },
      { id: "c", title: "Plus tôt", timeline_date: { year: 1, month: null, day: null }, mine: false, last_at: null },
      { id: "d", title: "Plus tard", timeline_date: { year: 5, month: null, day: null }, mine: false, last_at: null },
    ],
    error: null,
  });
  return { from: (t: string) => builder(t), rpc } as never;
}

beforeEach(() => {
  writeError = null;
  insertedStatus = "accepted";
  sequels = [];
  writes.length = 0;
  toastError.mockReset();
  toastInfo.mockReset();
});

function monter(onSaved = vi.fn()) {
  render(<ChatroomTimelineLinks chatroomId="self" worldId="w1" config={CONFIG} supabase={fakeClient()} onSaved={onSaved} />);
}

describe("ChatroomTimelineLinks", () => {
  it("les salons précédents possibles : les autres salons datés, ceux où l'on joue d'abord", async () => {
    monter();
    const ajout = await screen.findByRole("combobox", { name: "Ajouter un salon précédent…" });
    await screen.findByRole("option", { name: "La grande crue — 3 Février, An 1" });
    const groupes = ajout.querySelectorAll("optgroup");
    expect([...groupes].map((g) => g.getAttribute("label"))).toEqual(["Où vous jouez", "Autres salons"]);
    expect(within(groupes[0] as HTMLElement).getByRole("option").textContent).toBe("La grande crue — 3 Février, An 1");
    expect(within(groupes[1] as HTMLElement).getByRole("option").textContent).toBe("Plus tôt — An 1");
    // Pas lui-même, ni un salon situé après lui : ce serait une suite à rebours.
    expect(screen.queryByRole("option", { name: /^Moi/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Plus tard/ })).toBeNull();
  });

  it("choisir un arc l'enregistre aussitôt", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    monter(onSaved);
    const arc = await screen.findByRole("combobox", { name: "Arc" });
    await screen.findByRole("option", { name: "L'exil" });
    await user.selectOptions(arc, "L'exil");
    expect(writes).toContainEqual(expect.objectContaining({ table: "chatrooms", op: "update", payload: { arc_id: "arc" }, eq: ["id", "self"] }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("ajouter un salon précédent crée un lien ; proposé, on est prévenu qu'il attend un accord", async () => {
    const user = userEvent.setup();
    insertedStatus = "pending";
    monter();
    const ajout = await screen.findByRole("combobox", { name: "Ajouter un salon précédent…" });
    await screen.findByRole("option", { name: "Plus tôt — An 1" });
    await user.selectOptions(ajout, "Plus tôt — An 1");
    expect(writes).toContainEqual(expect.objectContaining({
      table: "chatroom_sequels", op: "insert", payload: { world_id: "w1", chatroom_id: "self", previous_id: "c" },
    }));
    await vi.waitFor(() => expect(toastInfo).toHaveBeenCalledWith("Suite proposée : les participants de l'autre salon doivent l'accepter."));
  });

  it("liste les salons suivis, marque ceux proposés, et en retire un", async () => {
    const user = userEvent.setup();
    sequels = [{ id: "s1", previous_id: "b", status: "accepted" }, { id: "s2", previous_id: "c", status: "pending" }];
    monter();
    const liste = await screen.findByRole("list", { name: "Suite de" });
    await vi.waitFor(() => expect(liste).toHaveTextContent("La grande crue — 3 Février, An 1"));
    const lignes = within(liste).getAllByRole("listitem");
    expect(lignes[0]).not.toHaveTextContent("proposée");
    expect(lignes[1]).toHaveTextContent("proposée");
    // Déjà reliés : plus dans la liste d'ajout.
    expect(screen.queryByRole("option", { name: "La grande crue — 3 Février, An 1" })).toBeNull();

    await user.click(within(lignes[1]).getByRole("button", { name: "Retirer le lien avec Plus tôt" }));
    expect(writes).toContainEqual(expect.objectContaining({ table: "chatroom_sequels", op: "delete", eq: ["id", "s2"] }));
  });

  it("un lien refusé (boucle, droits) : un message, sans le texte brut de la base", async () => {
    const user = userEvent.setup();
    writeError = { message: "Cette suite formerait une boucle." };
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    monter();
    const ajout = await screen.findByRole("combobox", { name: "Ajouter un salon précédent…" });
    await screen.findByRole("option", { name: "Plus tôt — An 1" });
    await user.selectOptions(ajout, "Plus tôt — An 1");
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("Impossible d'enregistrer l'arc ou la suite de ce salon."));
    erreur.mockRestore();
  });
});
