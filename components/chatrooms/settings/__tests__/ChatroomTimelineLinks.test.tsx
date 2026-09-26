import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { ChatroomTimelineLinks } from "@/components/chatrooms/settings/ChatroomTimelineLinks";

const CONFIG: WorldTimelineConfig = {
  year_label: "An", era_name: null, month_names: ["Janvier", "Février"], current_year: 1, current_month: 0,
};

let updateError: unknown = null;
const updates: { payload: unknown; eq: unknown[] }[] = [];
function fakeClient() {
  function builder(table: string) {
    let single = false;
    let payload: unknown = undefined;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "not"]) b[m] = () => b;
    b.eq = (...args: unknown[]) => { if (payload !== undefined) updates.push({ payload, eq: args }); return b; };
    b.maybeSingle = () => { single = true; return b; };
    b.update = (p: unknown) => { payload = p; return b; };
    b.then = (resolve: (v: unknown) => unknown) => {
      if (payload !== undefined) return Promise.resolve({ data: null, error: updateError }).then(resolve);
      const data =
        table === "world_timeline_arcs" ? [{ id: "arc", name: "L'exil" }]
        : single ? { arc_id: null, previous_chatroom_id: "b" }
        : [
            { id: "self", title: "Moi", name: null, timeline_date: { year: 2, month: 0, day: 1 } },
            { id: "b", title: "La grande crue", name: null, timeline_date: { year: 1, month: 1, day: 3 } },
            { id: "c", title: "Plus tard", name: null, timeline_date: { year: 5, month: null, day: null } },
          ];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as never;
}

beforeEach(() => {
  updateError = null;
  updates.length = 0;
  toastError.mockReset();
});

describe("ChatroomTimelineLinks", () => {
  it("montre l'arc et la suite actuels ; les autres salons datés, dans l'ordre du récit, sans lui-même", async () => {
    render(<ChatroomTimelineLinks chatroomId="self" worldId="w1" config={CONFIG} supabase={fakeClient()} />);
    const suite = await screen.findByRole("combobox", { name: "Suite de" });
    await vi.waitFor(() => expect(suite).toHaveValue("b"));
    const options = [...(suite as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options).toEqual(["Aucun salon", "La grande crue — 3 Février, An 1", "Plus tard — An 5"]);
    expect(screen.getByRole("combobox", { name: "Arc" })).toHaveValue("");
  });

  it("choisir un arc l'enregistre aussitôt", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ChatroomTimelineLinks chatroomId="self" worldId="w1" config={CONFIG} supabase={fakeClient()} onSaved={onSaved} />);
    const arc = await screen.findByRole("combobox", { name: "Arc" });
    await screen.findByRole("option", { name: "L'exil" });
    await user.selectOptions(arc, "L'exil");
    expect(updates).toContainEqual({ payload: { arc_id: "arc" }, eq: ["id", "self"] });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("une suite refusée (boucle) : un message, sans le texte brut de la base", async () => {
    const user = userEvent.setup();
    updateError = { message: "Cette suite formerait une boucle." };
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChatroomTimelineLinks chatroomId="self" worldId="w1" config={CONFIG} supabase={fakeClient()} />);
    const suite = await screen.findByRole("combobox", { name: "Suite de" });
    await vi.waitFor(() => expect(suite).toHaveValue("b"));
    await user.selectOptions(suite, "Plus tard — An 5");
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("Impossible d'enregistrer l'arc ou la suite de ce salon."));
    // La valeur affichée reste l'ancienne.
    expect(suite).toHaveValue("b");
    erreur.mockRestore();
  });
});
