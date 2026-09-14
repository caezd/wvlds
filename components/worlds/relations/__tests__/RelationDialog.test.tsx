import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RelationDialog } from "../RelationDialog";
import type { CPersona, CRelType, CRelation } from "../types";

const ADHI: CPersona = { id: "p1", name: "Adhi", avatar_url: null, user_id: "u1" };
const NYX: CPersona = { id: "p2", name: "Nyx", avatar_url: null, user_id: "u2" };
const TYPES: CRelType[] = [
  { id: "t-ally", name: "Allié", color: "#22c55e", dash: "", sort_index: 0, mutual: false, marital_status: null },
  { id: "t-enemy", name: "Ennemi", color: "#ef4444", dash: "", sort_index: 1, mutual: false, marital_status: null },
  { id: "t-couple", name: "En couple", color: "#ec4899", dash: "", sort_index: 2, mutual: true, marital_status: "in_relationship" },
];
const rel = (type: string, status: CRelation["status"] = "accepted"): CRelation =>
  ({ id: "r1", from_persona_id: "p1", to_persona_id: "p2", type, label: null, description: "Vieux rivaux", status });

function mount(existing: { rel: CRelation; to: CPersona } | null, onUpdate = vi.fn().mockResolvedValue(true)) {
  render(
    <RelationDialog open onOpenChange={vi.fn()} from={ADHI} personas={[ADHI, NYX]} relTypes={TYPES}
      myPersonaIds={new Set(["p1"])} existing={existing}
      onCreate={vi.fn().mockResolvedValue(true)} onUpdate={onUpdate} />,
  );
  return onUpdate;
}

describe("RelationDialog — modification", () => {
  it("d'une relation à sens unique : type et description changent, la cible non", async () => {
    const user = userEvent.setup();
    const onUpdate = mount({ rel: rel("t-ally"), to: NYX });

    expect(screen.getByRole("dialog", { name: "Modifier la relation" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("radio", { name: /Allié/ })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: /Ennemi/ }));
    await user.clear(screen.getByLabelText("Description (optionnelle, markdown)…"));
    await user.type(screen.getByLabelText("Description (optionnelle, markdown)…"), "Trahison");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onUpdate).toHaveBeenCalledWith("r1", { typeId: "t-enemy", description: "Trahison" });
  });

  it("d'une relation réciproque : le type est figé, seule la description part", async () => {
    const user = userEvent.setup();
    const onUpdate = mount({ rel: rel("t-couple"), to: NYX });

    expect(screen.getByRole("radio", { name: /Ennemi/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /En couple/ })).toBeChecked();
    expect(screen.getByText(/ne se change pas/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Description (optionnelle, markdown)…"), " !");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onUpdate).toHaveBeenCalledWith("r1", { description: "Vieux rivaux !" });
  });
});
