import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as React from "react";
import {
  FeaturePage,
  InactiveOptions,
  SettingsAddRow,
  SettingsChoiceCards,
  SettingsEmpty,
  SettingsHeaderProvider,
  SettingsPageShown,
  SettingsSection,
  SettingsSegmented,
  ToggleItem,
  ToggleList,
} from "@/components/worlds/settings/FeatureLayout";

/** Une barre d'en-tête comme celle de WorldSettingsView : deux emplacements. */
function AvecEnTete({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<HTMLElement | null>(null);
  const [actions, setActions] = React.useState<HTMLElement | null>(null);
  return (
    <SettingsHeaderProvider value={{ title, actions }}>
      <div data-testid="en-tete">
        <span ref={setTitle} data-testid="titre" />
        <span ref={setActions} data-testid="actions" />
      </div>
      <main data-testid="page">{children}</main>
    </SettingsHeaderProvider>
  );
}

/**
 * Les briques communes des pages de réglages : le texte d'explication se lit
 * en clair (sous-titre de section, description de rangée), l'aide cachée
 * devient l'exception.
 */
describe("FeaturePage", () => {
  it("son interrupteur d'activation est dans la page, avec son libellé visible", async () => {
    const onChange = vi.fn();
    render(
      <FeaturePage
        title="Carte"
        toggle={{ label: "Activer la carte", checked: false, onCheckedChange: onChange }}
      />,
    );
    expect(screen.getByText("Activer la carte")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("switch", { name: "Activer la carte" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("l'aide de l'interrupteur dit ce que la désactivation garde", () => {
    render(
      <FeaturePage
        title="Carte"
        toggle={{ label: "Activer la carte", checked: true, onCheckedChange: () => {}, help: "Rien n'est supprimé." }}
      />,
    );
    expect(screen.getByRole("button", { name: /Aide/ })).toBeInTheDocument();
  });
});

describe("FeaturePage dans la barre d'en-tête", () => {
  it("son titre et ses actions montent dans l'en-tête ; l'interrupteur reste dans la page", () => {
    render(
      <AvecEnTete>
        <FeaturePage
          title="Chatbox"
          actions={<button type="button">Nouvelle salle</button>}
          toggle={{ label: "Activer la chatbox", checked: true, onCheckedChange: () => {} }}
        />
      </AvecEnTete>,
    );
    expect(within(screen.getByTestId("titre")).getByRole("heading", { name: "Chatbox" })).toBeInTheDocument();
    expect(within(screen.getByTestId("actions")).getByRole("button", { name: "Nouvelle salle" })).toBeInTheDocument();
    const page = screen.getByTestId("page");
    expect(within(page).getByRole("switch", { name: "Activer la chatbox" })).toBeInTheDocument();
    expect(within(page).queryByRole("heading")).toBeNull();
  });

  it("une page montée mais cachée n'écrit pas dans l'en-tête", () => {
    render(
      <AvecEnTete>
        <SettingsPageShown value={false}>
          <FeaturePage title="Carte" />
        </SettingsPageShown>
        <SettingsPageShown value={true}>
          <FeaturePage title="Wiki" />
        </SettingsPageShown>
      </AvecEnTete>,
    );
    const titre = screen.getByTestId("titre");
    expect(within(titre).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Wiki"]);
  });

  it("une sous-page renvoie à sa page parente par le fil d'Ariane", async () => {
    const onBack = vi.fn();
    render(
      <AvecEnTete>
        <FeaturePage title="Maison" back={{ label: "Groupes", onClick: onBack }} />
      </AvecEnTete>,
    );
    await userEvent.setup().click(within(screen.getByTestId("titre")).getByRole("button", { name: "Groupes" }));
    expect(onBack).toHaveBeenCalledOnce();
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

describe("Sections à plat", () => {
  it("une section n'est pas une carte : un trait la sépare de la précédente, sans fond", () => {
    render(
      <div>
        <SettingsSection title="Visibilité"><p>a</p></SettingsSection>
        <SettingsSection title="Tags"><p>b</p></SettingsSection>
      </div>,
    );
    for (const nom of ["Visibilité", "Tags"]) {
      const classes = screen.getByRole("region", { name: nom }).className.split(" ");
      expect(classes).not.toContain("bg-card");
      expect(classes).toContain("border-t");
    }
    // La première de la page n'a pas de trait au-dessus d'elle.
    expect(screen.getByRole("region", { name: "Visibilité" }).className.split(" ")).toContain("first:border-t-0");
  });

  it("ses listes d'interrupteurs restent bordées", () => {
    render(
      <SettingsSection title="Options">
        <ToggleList label="options">
          <ToggleItem title="Bulles" checked={false} onCheckedChange={() => {}} />
        </ToggleList>
      </SettingsSection>,
    );
    const liste = screen.getByRole("group", { name: "options" });
    expect(liste.className.split(" ")).toEqual(expect.arrayContaining(["rounded-lg", "bg-card"]));
  });
});

describe("InactiveOptions d'une fonction", () => {
  it("une tuile qui le dit, et ses réglages repliés, inertes", async () => {
    const user = userEvent.setup();
    render(
      <InactiveOptions inactive feature>
        <input aria-label="Nom" />
      </InactiveOptions>,
    );
    expect(screen.getByText("Cette fonction est désactivée.")).toBeInTheDocument();
    await user.click(screen.getByText("Voir ses réglages"));
    expect(screen.getByRole("textbox", { name: "Nom" })).toBeDisabled();
  });

  it("une option coupée dans une page (sans `feature`) : seulement grisée, sans tuile", () => {
    render(
      <InactiveOptions inactive>
        <input aria-label="Nom" />
      </InactiveOptions>,
    );
    expect(screen.queryByText("Cette fonction est désactivée.")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Nom" })).toBeDisabled();
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
  it("une seule tuile : la phrase et le « + » qui remplit la liste", async () => {
    const onAdd = vi.fn();
    render(<SettingsEmpty onAdd={onAdd} addLabel="Nouveau groupe">Aucun groupe défini</SettingsEmpty>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Nouveau groupe" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("une phrase et son action", () => {
    render(<SettingsEmpty action={<button type="button">Ajouter une fête</button>}>Aucune fête pour l’instant.</SettingsEmpty>);
    expect(screen.getByText("Aucune fête pour l’instant.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ajouter une fête" })).toBeInTheDocument();
  });
});

describe("SettingsChoiceCards", () => {
  const Icone = () => <svg />;
  it("un choix à conséquences : des cartes radio, une seule retenue", async () => {
    const onToggle = vi.fn();
    render(
      <SettingsChoiceCards
        label="Visibilité"
        value={["private"]}
        onToggle={onToggle}
        options={[
          { value: "private", label: "Privé", description: "Absent de l’Explorateur.", icon: Icone },
          { value: "public", label: "Public", description: "Visible de tous.", icon: Icone },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Visibilité" });
    expect(within(group).getByRole("radio", { name: /^Privé/ })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByText("Absent de l’Explorateur.")).toBeVisible();
    const user = userEvent.setup();
    await user.click(within(group).getByRole("radio", { name: /^Privé/ }));
    expect(onToggle).not.toHaveBeenCalled();
    await user.click(within(group).getByRole("radio", { name: /^Public/ }));
    expect(onToggle).toHaveBeenCalledWith("public");
  });

  it("`multiple` : des bascules qui ne s'excluent pas", async () => {
    const onToggle = vi.fn();
    render(
      <SettingsChoiceCards
        multiple
        label="Avatars"
        value={["real", "illustrated"]}
        onToggle={onToggle}
        options={[
          { value: "real", label: "Réels", icon: Icone },
          { value: "illustrated", label: "Illustrés", icon: Icone },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Avatars" });
    expect(within(group).getByRole("button", { name: "Réels" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup().click(within(group).getByRole("button", { name: "Réels" }));
    expect(onToggle).toHaveBeenCalledWith("real");
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
