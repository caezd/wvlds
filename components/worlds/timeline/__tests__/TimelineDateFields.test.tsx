import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineDateFields } from "@/components/worlds/timeline/TimelineDateFields";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  days_per_month: [31, 28, 31],
  current_year: 1327,
  current_month: null,
};

function monter(value: WorldTimelineDate | null) {
  const onChange = vi.fn();
  render(<TimelineDateFields label="Existe depuis" value={value} onChange={onChange} config={CONFIG} />);
  return onChange;
}

describe("TimelineDateFields", () => {
  it("l'année vide vaut « pas de date »", async () => {
    const onChange = monter({ year: 1200, month: null, day: null });
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Existe depuis" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("pose l'année, puis propose le mois, puis le jour", async () => {
    const onChange = monter(null);
    expect(screen.queryByRole("combobox", { name: "Mois" })).toBeNull();

    await userEvent.type(screen.getByRole("spinbutton", { name: "Existe depuis" }), "1");
    expect(onChange).toHaveBeenLastCalledWith({ year: 1, month: null, day: null });
  });

  it("choisir un mois remet le jour à zéro", async () => {
    const onChange = monter({ year: 1200, month: 0, day: 15 });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Mois" }), "1");
    expect(onChange).toHaveBeenLastCalledWith({ year: 1200, month: 1, day: null });
  });

  it("borne le jour à la longueur du mois", () => {
    // Février fait 28 jours dans ce monde : un 31 devient un 28.
    // Le champ est piloté par le parent : une seule saisie, entière.
    const onChange = monter({ year: 1200, month: 1, day: null });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Jour" }), { target: { value: "31" } });
    expect(onChange).toHaveBeenLastCalledWith({ year: 1200, month: 1, day: 28 });
  });
});
