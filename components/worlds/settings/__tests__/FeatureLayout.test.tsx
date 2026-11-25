import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FeaturePage,
  SettingsAddRow,
  SettingsEmpty,
  SettingsSection,
  SettingsSegmented,
  ToggleItem,
  ToggleList,
} from "@/components/worlds/settings/FeatureLayout";

/**
 * Les briques communes des pages de réglages : le texte d'explication se lit
 * en clair (sous-titre de page, de section, description de rangée), l'aide
 * cachée devient l'exception.
 */
describe("FeaturePage", () => {
  it("affiche son sous-titre sous le titre", () => {
    render(<FeaturePage title="Devises" description="Une monnaie propre au monde." />);
    const heading = screen.getByRole("heading", { name: "Devises" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("Une monnaie propre au monde.")).toBeVisible();
  });

  it("un interrupteur sans libellé visible, nommé pour les lecteurs d'écran", async () => {
    const onChange = vi.fn();
    render(
      <FeaturePage
        title="Carte"
        toggle={{ ariaLabel: "Activer la carte", checked: false, onCheckedChange: onChange }}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "Activer la carte" });
    await userEvent.setup().click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    // Plus d'« Activée » / « Désactivée » accordé au genre de la fonction.
    expect(screen.queryByText(/Activée|Désactivée/)).not.toBeInTheDocument();
  });

  it("l'aide de l'interrupteur dit ce que la désactivation garde", () => {
    render(
      <FeaturePage
        title="Carte"
        toggle={{ ariaLabel: "Activer la carte", checked: true, onCheckedChange: () => {}, help: "Rien n'est supprimé." }}
      />,
    );
    expect(screen.getByRole("button", { name: /Aide/ })).toBeInTheDocument();
  });
});

describe("SettingsSection", () => {
  it("titre, sous-titre et compteur", () => {
    render(
      <SettingsSection title="Paliers" description="Du plus grand au plus petit." count="3">
        <p>contenu</p>
      </SettingsSection>,
    );
    const section = screen.getByRole("region", { name: "Paliers" });
    expect(within(section).getByRole("heading", { name: /Paliers/ })).toBeInTheDocument();
    expect(within(section).getByText("Du plus grand au plus petit.")).toBeVisible();
    expect(within(section).getByText("3")).toBeInTheDocument();
  });

  it("en pleine largeur, le contenu passe sous l'en-tête", () => {
    render(
      <SettingsSection title="Journal" layout="stacked">
        <p>contenu</p>
      </SettingsSection>,
    );
    expect(screen.getByRole("region", { name: "Journal" })).toHaveAttribute("data-layout", "stacked");
  });
});

describe("ToggleItem", () => {
  it("sa description se lit en clair sous le titre", () => {
    render(
      <ToggleList>
        <ToggleItem title="Faceclaim obligatoire" description="Sans faceclaim, une fiche ne joue pas." checked={false} onCheckedChange={() => {}} />
      </ToggleList>,
    );
    expect(screen.getByText("Sans faceclaim, une fiche ne joue pas.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Aide/ })).not.toBeInTheDocument();
  });
});

describe("SettingsAddRow", () => {
  it("une rangée « + Ajouter » au bas d'une liste", async () => {
    const onClick = vi.fn();
    render(
      <ToggleList>
        <SettingsAddRow label="Ajouter un palier" onClick={onClick} />
      </ToggleList>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Ajouter un palier" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("SettingsEmpty", () => {
  it("une phrase et son action", () => {
    render(<SettingsEmpty action={<button type="button">Ajouter une fête</button>}>Aucune fête pour l’instant.</SettingsEmpty>);
    expect(screen.getByText("Aucune fête pour l’instant.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ajouter une fête" })).toBeInTheDocument();
  });
});

describe("SettingsSegmented", () => {
  it("un seul choix coché, un clic en change", async () => {
    const onChange = vi.fn();
    render(
      <SettingsSegmented
        label="Visibilité"
        value="private"
        onValueChange={onChange}
        options={[
          { value: "public", label: "Publique" },
          { value: "private", label: "Privée" },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Visibilité" });
    expect(within(group).getByRole("radio", { name: "Privée" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Publique" })).toHaveAttribute("aria-checked", "false");
    await userEvent.setup().click(within(group).getByRole("radio", { name: "Publique" }));
    expect(onChange).toHaveBeenCalledWith("public");
  });
});
