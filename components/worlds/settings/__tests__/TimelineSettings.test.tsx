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

    const ere = screen.getByLabelText(/^Ère \/ suffixe/);
    await user.clear(ere);
    await user.type(ere, "après la Chute");

    expect(within(screen.getByTestId("timeline-preview")).getByText("Dégel, an 342 après la Chute")).toBeInTheDocument();
    // Et l'aperçu sous le format, au même instant.
    expect(screen.getByTestId("timeline-format-preview")).toHaveTextContent("Dégel, an 342 après la Chute");
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

  it("chaque explication derrière une aide en bout de ligne, sans exemple ni texte sous le titre", () => {
    render(<Harnais />);
    const saisons = screen.getByRole("region", { name: "Saisons" });
    const aide = within(saisons).getByRole("button", { name: "Aide : Saisons" });
    expect(aide).toHaveAccessibleDescription(/^Des âges nommés qui découpent l'histoire du monde\./);
    // Plus d'exemple entre guillemets, ni de description visible sous le titre.
    expect(aide.getAttribute("aria-describedby")).toBeTruthy();
    expect(saisons.textContent).not.toMatch(/«/);
    expect(within(saisons).queryByText(/^Des âges nommés/, { selector: "p" })).toBeNull();
    // Ni « Ex. … » sous les champs du format.
    expect(screen.queryByText(/^Ex\./)).toBeNull();
    // Une aide par sous-option, et pour les options qu'elles contiennent.
    for (const nom of ["Aide : Fêtes du calendrier", "Aide : Afficher les journaux des personas", "Aide : Mise en sommeil"]) {
      expect(screen.getByRole("button", { name: nom })).toBeInTheDocument();
    }
  });

  it("le calendrier dit la longueur de l'année qu'il compose ; la date actuelle, où l'on en est dans l'année", () => {
    render(<Harnais />);
    expect(screen.getByTestId("timeline-year-length")).toHaveTextContent("2 mois · 58 jours");
    const date = screen.getByTestId("timeline-preview");
    expect(date).toHaveTextContent("Mois 2 / 2");
    expect(date).toHaveTextContent("58 jours par an");
    // Une barre par mois ; le mois actuel marqué.
    const barres = within(date).getByTestId("timeline-month-progress").children;
    expect(barres).toHaveLength(2);
    expect(barres[1]).toHaveAttribute("data-current", "true");
  });

  it("l'année actuelle se règle aussi d'un pas, en moins ou en plus", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);
    await user.click(screen.getByRole("button", { name: "Année suivante" }));
    expect(onPersist).toHaveBeenLastCalledWith({ current_year: 343 });
    await user.click(screen.getByRole("button", { name: "Année précédente" }));
    expect(onPersist).toHaveBeenLastCalledWith({ current_year: 342 });
  });

  it("l'accord suit les nombres : un mois d'un jour s'écrit au singulier", () => {
    render(<Harnais initial={{ ...CONFIG, month_names: ["Unique"], days_per_month: [1], current_month: 0 }} />);
    expect(screen.getByTestId("timeline-year-length")).toHaveTextContent("1 mois · 1 jour");
    expect(screen.getByTestId("timeline-preview")).toHaveTextContent("1 jour par an");
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

  it("la restriction nomme la période qu'elle imposerait, et s'enregistre", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);

    expect(screen.getByText(/ne pourra être situé qu'en Dégel, an 342 des Cendres/)).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Restreindre les salons à la période en cours" }));
    expect(onPersist).toHaveBeenCalledWith({ restrict_to_current: true });
  });

  it("exiger une date à la création s'enregistre dans la chronologie", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);

    await user.click(screen.getByRole("switch", { name: "Exiger une date à la création d'un salon" }));
    expect(onPersist).toHaveBeenCalledWith({ require_date: true });
  });
});

describe("TimelineSettings — saisons et frise", () => {
  it("ajoute une saison, triée par année de début, sans fin", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais initial={{ ...CONFIG, ages: [{ name: "Âge du Sel", from_year: 400, to_year: null }] }} onPersist={onPersist} />);

    await user.type(screen.getByRole("textbox", { name: "Nouvelle saison" }), "Âge des Cendres");
    await user.type(screen.getByRole("spinbutton", { name: "Dès l'an" }), "300");
    await user.click(screen.getByRole("button", { name: "Ajouter la saison" }));

    expect(onPersist).toHaveBeenLastCalledWith({
      ages: [
        { name: "Âge des Cendres", from_year: 300, to_year: null },
        { name: "Âge du Sel", from_year: 400, to_year: null },
      ],
    });
    // Le champ d'ajout se vide.
    expect(screen.getByRole("textbox", { name: "Nouvelle saison" })).toHaveValue("");
  });

  it("borne et supprime une saison", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais initial={{ ...CONFIG, ages: [{ name: "Âge du Sel", from_year: 400, to_year: null }] }} onPersist={onPersist} />);

    await user.type(screen.getByRole("spinbutton", { name: "Dernière année de Âge du Sel" }), "450");
    await user.tab();
    expect(onPersist).toHaveBeenLastCalledWith({ ages: [{ name: "Âge du Sel", from_year: 400, to_year: 450 }] });

    await user.click(screen.getByRole("button", { name: "Supprimer la saison Âge du Sel" }));
    expect(onPersist).toHaveBeenLastCalledWith({ ages: [] });
    expect(screen.getByText(/Aucune saison/)).toBeInTheDocument();
  });

  it("les journaux sur la frise : désactivés par défaut, un interrupteur les montre", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);
    const interrupteur = screen.getByRole("switch", { name: "Afficher les journaux des personas" });
    expect(interrupteur).not.toBeChecked();
    await user.click(interrupteur);
    expect(onPersist).toHaveBeenCalledWith({ show_journals: true });
  });
});

describe("TimelineSettings — responsive", () => {
  it("s'adapte à la place de sa page (requêtes de conteneur), pas à la fenêtre", () => {
    render(<Harnais />);
    // L'en-tête et chaque section : deux colonnes seulement quand la page a la place.
    const date = screen.getByTestId("timeline-preview").parentElement as HTMLElement;
    expect(date.className).toMatch(/@2xl:grid-cols-/);
    expect(date.className).not.toMatch(/(^|\s)(sm|md|lg):grid-cols-/);
    const section = screen.getByRole("region", { name: "Mois du calendrier" });
    expect(section.className).toMatch(/@2xl:grid-cols-/);
    expect(section.querySelector("ol")!.className).toMatch(/@lg:grid-cols-2/);
    // Les lignes d'ajout passent à la ligne plutôt que de déborder.
    const ajout = screen.getByRole("button", { name: "Ajouter la saison" }).parentElement as HTMLElement;
    expect(ajout.className.split(" ")).toContain("flex-wrap");
  });
});

describe("TimelineSettings — fêtes et mise en sommeil", () => {
  it("ajoute une fête, triée dans l'année ; son jour se borne au mois", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais initial={{ ...CONFIG, holidays: [{ name: "Nuit du Dégel", month: 1, day: 1 }] }} onPersist={onPersist} />);

    await user.type(screen.getByRole("textbox", { name: "Nouvelle fête" }), "Fête du Givre");
    // Givre compte 30 jours : 40 devient 30.
    await user.type(screen.getByRole("spinbutton", { name: "Jour" }), "40");
    await user.selectOptions(screen.getByRole("combobox", { name: "Mois de la nouvelle fête" }), "Givre");
    await user.click(screen.getByRole("button", { name: "Ajouter la fête" }));

    expect(onPersist).toHaveBeenLastCalledWith({
      holidays: [
        { name: "Fête du Givre", month: 0, day: 30 },
        { name: "Nuit du Dégel", month: 1, day: 1 },
      ],
    });
    expect(screen.getByRole("textbox", { name: "Nouvelle fête" })).toHaveValue("");
  });

  it("une fête sans jour vaut pour le mois ; elle se supprime", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais initial={{ ...CONFIG, holidays: [{ name: "Nuit du Dégel", month: 1, day: 1 }] }} onPersist={onPersist} />);

    // La date en pastille ; un appui ouvre le jour et le mois.
    const pastille = screen.getByRole("button", { name: "Date de Nuit du Dégel" });
    expect(pastille).toHaveTextContent("1 Dégel");
    await user.click(pastille);
    await user.clear(await screen.findByRole("spinbutton", { name: "Jour de Nuit du Dégel" }));
    await user.tab();
    expect(onPersist).toHaveBeenLastCalledWith({ holidays: [{ name: "Nuit du Dégel", month: 1, day: null }] });
    // Sans jour, la pastille dit le mois seul.
    expect(screen.getByRole("button", { name: "Date de Nuit du Dégel" })).toHaveTextContent(/^Dégel$/);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Supprimer la fête Nuit du Dégel" }));
    expect(onPersist).toHaveBeenLastCalledWith({ holidays: [] });
    expect(screen.getByText("Aucune fête au calendrier.")).toBeInTheDocument();
  });

  it("la mise en sommeil : 30 jours par défaut, 0 pour jamais, bornée", async () => {
    const onPersist = vi.fn();
    const user = userEvent.setup();
    render(<Harnais onPersist={onPersist} />);
    const delai = screen.getByRole("spinbutton", { name: "Mise en sommeil, en jours" });
    expect(delai).toHaveValue(30);
    await user.clear(delai);
    await user.type(delai, "0");
    await user.tab();
    expect(onPersist).toHaveBeenLastCalledWith({ dormant_days: 0 });
    await user.clear(delai);
    await user.type(delai, "99999");
    await user.tab();
    expect(onPersist).toHaveBeenLastCalledWith({ dormant_days: 3650 });
  });
});
