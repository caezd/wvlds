import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StatsField } from "../StatsField";
import { SkillsField } from "../SkillsField";
import { GaugesField } from "../GaugesField";
import { TraitsField } from "../TraitsField";
import { DlField } from "../DlField";
import type { WorldCatalogItem } from "@/types/worlds";

// ──────────────────────────────────────────────────────────────────────────
// Les éditeurs de champ de fiche vivaient dans un fichier de 1 569 lignes, sans
// un seul test. Les voilà séparés — et couverts.
//
// Ce qui est vérifié ici n'est pas l'apparence mais le contrat commun à tous :
// chacun tient son propre état ET remonte la liste complète au parent à chaque
// modification. Une régression sur ce point ne se voit pas à l'écran — le champ
// répond normalement — mais la fiche s'enregistre amputée.
//
// Plus le mode « catalogue », la seule vraie règle métier du lot : dans un monde
// qui restreint l'inventaire ou les compétences, on ne peut choisir que dans le
// catalogue, et jamais deux fois le même élément.
// ──────────────────────────────────────────────────────────────────────────

describe("StatsField", () => {
  it("remonte la liste complète à chaque frappe", async () => {
    const onSave = vi.fn();
    render(<StatsField initialItems={[]} onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /stat/i }));
    expect(onSave).toHaveBeenLastCalledWith([
      expect.objectContaining({ label: "", value: "", unit: "" }),
    ]);

    const [label] = screen.getAllByPlaceholderText("AGI");
    await userEvent.type(label, "FOR");

    // Le parent reçoit la liste ENTIÈRE, pas le seul champ modifié.
    const dernier = onSave.mock.calls.at(-1)![0];
    expect(dernier).toHaveLength(1);
    expect(dernier[0].label).toBe("FOR");
  });

  it("supprime la stat visée et laisse les autres", async () => {
    const onSave = vi.fn();
    render(
      <StatsField
        initialItems={[
          { id: "a", label: "AGI", value: "10", unit: "" },
          { id: "b", label: "FOR", value: "12", unit: "" },
        ]}
        onSave={onSave}
      />,
    );

    const [supprimer] = screen.getAllByRole("button", { name: "Supprimer la stat" });
    await userEvent.click(supprimer);

    expect(onSave).toHaveBeenLastCalledWith([expect.objectContaining({ id: "b" })]);
  });

  it("donne un identifiant distinct à chaque ajout", async () => {
    // Deux items partageant une clé React, c'est un rendu qui déraille dès le
    // premier tri ou la première suppression.
    const onSave = vi.fn();
    render(<StatsField initialItems={[]} onSave={onSave} />);

    const ajouter = screen.getByRole("button", { name: /stat/i });
    await userEvent.click(ajouter);
    await userEvent.click(ajouter);

    const ids = onSave.mock.calls.at(-1)![0].map((s: { id: string }) => s.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("SkillsField", () => {
  it("en mode catalogue, écarte les compétences déjà prises", async () => {
    const catalogue = [
      { id: "s1", name: "Escrime", description: null, icon: null },
      { id: "s2", name: "Alchimie", description: null, icon: null },
    ] as WorldCatalogItem[];
    const onSave = vi.fn();

    render(
      <SkillsField
        initialItems={[{ id: "x", catalog_id: "s1", name: "Escrime", level: "" }]}
        onSave={onSave}
        catalogItems={catalogue}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /ajouter depuis le catalogue/i }));
    const choix = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Alchimie"));
    expect(choix).toHaveLength(1);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Escrime");

    await userEvent.click(choix[0]);
    expect(onSave).toHaveBeenLastCalledWith([
      expect.objectContaining({ catalog_id: "s1" }),
      expect.objectContaining({ catalog_id: "s2", level: "" }),
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Le catalogue fait foi.
//
// La fiche gardait une COPIE du nom prise à l'ajout : renommer un objet dans
// le catalogue ne changeait rien nulle part, et le supprimer laissait dans
// chaque fiche un fantôme que rien ne distinguait d'une entrée valide.
// ──────────────────────────────────────────────────────────────────────────

describe("GaugesField", () => {
  it("plafonne la barre à 100 % quand la valeur dépasse le maximum", () => {
    const { container } = render(
      <GaugesField
        initialItems={[{ id: "g", name: "PV", value: 150, max: 100, color: "#6366f1" }]}
        onSave={vi.fn()}
      />,
    );

    // Sans le plafond, la barre déborderait de son conteneur.
    const barre = container.querySelector<HTMLElement>('[style*="width"]');
    expect(barre?.style.width).toBe("100%");
  });

  it("empêche un maximum nul, qui ferait une division par zéro", async () => {
    const onSave = vi.fn();
    render(
      <GaugesField
        initialItems={[{ id: "g", name: "PV", value: 10, max: 100, color: "#6366f1" }]}
        onSave={onSave}
      />,
    );

    // Deux champs numériques seulement : la valeur puis le maximum. La
    // pastille de couleur est un bouton.
    const [, maxInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(maxInput);
    await userEvent.type(maxInput, "0");

    expect(onSave.mock.calls.at(-1)![0][0].max).toBeGreaterThanOrEqual(1);
  });

  it("choisit la couleur d'une jauge dans le sélecteur de l'application", async () => {
    const onSave = vi.fn();
    render(
      <GaugesField
        initialItems={[{ id: "g", name: "PV", value: 10, max: 100, color: "#6366f1" }]}
        onSave={onSave}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Choisir une couleur" }));
    await userEvent.click(await screen.findByRole("button", { name: "Orange" }));
    expect(onSave.mock.calls.at(-1)![0][0].color).toBe("#f27a12");

    // Les jauges acceptent une couleur translucide.
    expect(screen.getByRole("slider", { name: "Opacité" })).toBeInTheDocument();
  });
});

describe("TraitsField et DlField", () => {
  it("TraitsField ajoute puis retire un trait", async () => {
    const onSave = vi.fn();
    render(<TraitsField initialItems={[]} onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /trait/i }));
    expect(onSave).toHaveBeenLastCalledWith([expect.objectContaining({ label: "" })]);

    await userEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(onSave).toHaveBeenLastCalledWith([]);
  });

  it("DlField ajoute une entrée avec ses deux colonnes", async () => {
    const onSave = vi.fn();
    render(<DlField initialItems={[]} onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /ajouter une entrée/i }));
    expect(onSave).toHaveBeenLastCalledWith([
      expect.objectContaining({ label: "", description: "" }),
    ]);
    expect(screen.getByPlaceholderText("Titre")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Description")).toBeInTheDocument();
  });

  // Régression : la description était un `<input>`, un contrôle mono-ligne.
  // Un texte un peu long ne revenait donc pas à la ligne, il défilait
  // horizontalement — illisible en édition, alors que la fiche l'affiche bien
  // sur plusieurs lignes. Le type du contrôle EST le comportement ici : aucun
  // réglage de style ne fait revenir un `<input>` à la ligne.
  it("DlField saisit la description dans un contrôle multi-ligne", () => {
    render(<DlField initialItems={[{ id: "a", label: "Taille", description: "" }]} onSave={vi.fn()} />);

    expect(screen.getByPlaceholderText("Description").tagName).toBe("TEXTAREA");
  });

  // Régression : la description vivait dans une colonne dont la largeur était
  // dictée par le plus long des titres — largement trop étroite dans un
  // tiroir. Titre et description occupent maintenant chacun leur ligne, comme
  // à l'affichage.
  it("DlField place la description sous son titre, pas dans une colonne voisine", () => {
    render(<DlField initialItems={[{ id: "a", label: "Taille", description: "x" }]} onSave={vi.fn()} />);

    const titre = screen.getByPlaceholderText("Titre");
    const description = screen.getByPlaceholderText("Description");
    // La description n'est pas un frère direct du titre dans une grille :
    // elle est dans le bloc qui suit, donc en dessous.
    expect(titre.parentElement).toBe(description.closest("div")!.parentElement);
    expect(titre.className).toContain("w-full");
  });

  it("DlField conserve les sauts de ligne d'une description", async () => {
    const onSave = vi.fn();
    render(<DlField initialItems={[{ id: "a", label: "Taille", description: "" }]} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("Description"), "2m10{enter}au garrot");

    expect(onSave).toHaveBeenLastCalledWith([
      expect.objectContaining({ description: "2m10\nau garrot" }),
    ]);
  });
});
