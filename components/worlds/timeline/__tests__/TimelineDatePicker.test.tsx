import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { TimelineDatePicker } from "@/components/worlds/timeline/TimelineDatePicker";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: "des Cendres",
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 1,
  current_month: 1,
};

function Harnais({ config = CONFIG, initial, onCommit = vi.fn() }: {
  config?: WorldTimelineConfig;
  initial: WorldTimelineDate;
  onCommit?: (d: WorldTimelineDate) => void;
}) {
  const [date, setDate] = React.useState(initial);
  return <TimelineDatePicker config={config} value={date} onCommit={(d) => { setDate(d); onCommit(d); }} />;
}

describe("TimelineDatePicker", () => {
  it("le jour suit la longueur du mois choisi", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<Harnais initial={{ year: 3, month: 1, day: null }} onCommit={onCommit} />);

    const jour = screen.getByLabelText("Jour");
    expect(jour).toHaveAttribute("placeholder", "Jour (1–28)");
    await user.type(jour, "45");
    await user.tab();

    // Borné à 28 jours, et affiché tel quel.
    expect(onCommit).toHaveBeenLastCalledWith({ year: 3, month: 1, day: 28 });
    expect(jour).toHaveValue(28);
  });

  it("sans mois, pas de jour à choisir", () => {
    render(<Harnais initial={{ year: 3, month: null, day: null }} />);
    expect(screen.queryByLabelText("Jour")).toBeNull();
  });

  it("changer de mois efface le jour", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<Harnais initial={{ year: 3, month: 0, day: 12 }} onCommit={onCommit} />);

    await user.selectOptions(screen.getByLabelText("Mois"), "Dégel");
    expect(onCommit).toHaveBeenLastCalledWith({ year: 3, month: 1, day: null });
  });

  it("restreinte à la période en cours : année et mois figés, le jour reste libre", () => {
    render(<Harnais config={{ ...CONFIG, restrict_to_current: true }} initial={{ year: 40, month: 0, day: 3 }} />);

    // La période se lit en clair, avec l'explication pour les lecteurs d'écran.
    const periode = screen.getByTestId("timeline-period-lock");
    expect(periode).toHaveTextContent("Dégel, an 1 des Cendres");
    expect(periode).toHaveTextContent("Le monde restreint les salons à la période en cours");
    // Ni champ d'année ni liste de mois : seul le jour se choisit.
    expect(screen.queryByLabelText(/Numéro de l'année/)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByLabelText("Jour")).toHaveValue(3);
  });

  it("l'année seule figée (pas de mois courant) : le mois reste au choix", () => {
    render(
      <Harnais
        config={{ ...CONFIG, restrict_to_current: true, current_month: null }}
        initial={{ year: 40, month: null, day: null }}
      />,
    );
    expect(screen.getByTestId("timeline-period-lock")).toHaveTextContent("an 1 des Cendres");
    expect(screen.getByLabelText("Mois")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Numéro de l'année/)).toBeNull();
  });

  it("tout tient sur une ligne : jour, mois, année", () => {
    render(<Harnais initial={{ year: 3, month: 1, day: 5 }} />);
    const ligne = screen.getByTestId("timeline-date-picker");
    expect(ligne.className).toContain("flex");
    expect(screen.getByLabelText("Jour")).toHaveValue(5);
    expect(screen.getByLabelText("Mois")).toHaveDisplayValue("Dégel");
    expect(screen.getByLabelText("Numéro de l'année (an)")).toHaveValue(3);
  });
});
