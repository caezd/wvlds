import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { TimelineSettings } from "@/components/worlds/settings/TimelineSettings";
import type { WorldTimelineConfig } from "@/types/worlds";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: "des Cendres",
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 342,
  current_month: 1,
};

/** Le composant tel que l'onglet le monte : l'état vit au-dessus de lui. */
function Harnais({ initial = CONFIG, onPersist = vi.fn() }: { initial?: WorldTimelineConfig; onPersist?: (p: Partial<WorldTimelineConfig>) => void }) {
  const [config, setConfig] = React.useState(initial);
  return (
    <TimelineSettings
      config={config}
      onDraft={(patch) => setConfig((c) => ({ ...c, ...patch }))}
      onPersist={(patch) => { setConfig((c) => ({ ...c, ...patch })); onPersist(patch); }}
    />
  );
}

describe("TimelineSettings — comprendre ce que l'on règle", () => {
  it("l'aperçu montre la date actuelle du récit telle que les salons l'afficheront", () => {
    render(<Harnais />);
    expect(within(screen.getByTestId("timeline-preview")).getByText("Dégel, an 342 des Cendres")).toBeInTheDocument();
  });

  it("l'aperçu suit la frappe, avant même l'enregistrement", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);

    const ere = screen.getByLabelText("Ère / suffixe");
    await user.clear(ere);
    await user.type(ere, "après la Chute");

    expect(within(screen.getByTestId("timeline-preview")).getByText("Dégel, an 342 après la Chute")).toBeInTheDocument();
    // L'écriture n'a lieu qu'à la sortie du champ.
    expect(onPersist).not.toHaveBeenCalled();
    await user.tab();
    expect(onPersist).toHaveBeenCalledWith({ era_name: "après la Chute" });
  });

  it("trois sous-options nommées, chacune avec ce qu'elle apporte", () => {
    render(<Harnais />);
    expect(screen.getByRole("region", { name: "Format des dates" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Où en est le récit" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mois du calendrier" })).toBeInTheDocument();
  });

  it("le calendrier dit la longueur de l'année qu'il compose", () => {
    render(<Harnais />);
    // Le mock de next-intl ne résout pas les pluriels ICU : on s'en tient aux
    // deux nombres, que le vrai rendu accorde (« 2 mois · 58 jours par an »).
    expect(screen.getByTestId("timeline-year-length")).toHaveTextContent(/2 .*58 /);
  });

  it("sans mois, il le dit plutôt que de laisser une liste vide", () => {
    render(<Harnais initial={{ ...CONFIG, month_names: [], days_per_month: [], current_month: null }} />);
    expect(screen.getByText("Sans mois, une date ne porte que l'année.")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-year-length")).toBeNull();
    // L'aperçu se réduit à l'année.
    expect(within(screen.getByTestId("timeline-preview")).getByText("an 342 des Cendres")).toBeInTheDocument();
  });

  it("supprimer un mois avant le mois courant garde le même mois courant", async () => {
    // Le courant pointe « Dégel » (indice 1) ; retirer « Givre » le décale en 0.
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);

    await user.click(screen.getByRole("button", { name: "Supprimer le mois Givre" }));

    expect(onPersist).toHaveBeenCalledWith({ month_names: ["Dégel"], days_per_month: [28], current_month: 0 });
    expect(within(screen.getByTestId("timeline-preview")).getByText("Dégel, an 342 des Cendres")).toBeInTheDocument();
  });
});
