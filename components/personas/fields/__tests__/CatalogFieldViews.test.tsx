import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InventoryFieldView, SkillsFieldView } from "../CatalogFieldViews";
import { indexCatalog } from "@/lib/worldCatalog";
import type { WorldCatalogItem } from "@/types/worlds";

// Les propriétés d'un objet — poids, portée, prérequis — se lisaient dans le
// catalogue seulement. La fiche d'un persona, où l'on regarde justement ce
// qu'il porte, les montre désormais : sous la compétence, dans l'infobulle
// d'un objet. Sans catalogue chargé, la copie rangée dans la fiche n'en a pas.

const catalogue = indexCatalog([
  {
    id: "c-epee", world_id: "w1", type: "inventory", name: "Épée longue", description: "Une lame fiable.",
    properties: [{ label: "Poids", value: "1,5 kg" }, { label: "Dégâts", value: "1d8" }],
  },
  {
    id: "c-forge", world_id: "w1", type: "skills", name: "Forge", description: null,
    properties: [{ label: "Prérequis", value: "Force 12" }],
  },
] as WorldCatalogItem[]);

describe("propriétés sur la fiche du persona", () => {
  it("une compétence liste ses propriétés sous son nom", () => {
    render(
      <SkillsFieldView items={[{ id: "s1", catalog_id: "c-forge", name: "Forge", level: "3" }]} catalog={catalogue} />,
    );
    expect(screen.getByText("Prérequis")).toBeInTheDocument();
    expect(screen.getByText("Force 12")).toBeInTheDocument();
  });

  it("un objet montre les siennes dans son infobulle, avec la description", async () => {
    const user = userEvent.setup();
    render(
      <InventoryFieldView items={[{ id: "i1", catalog_id: "c-epee", name: "Épée", quantity: 1 }]} catalog={catalogue} />,
    );
    expect(screen.queryByText("Poids")).toBeNull();

    await user.hover(screen.getByText("Épée longue"));
    const bulle = await screen.findByRole("tooltip");
    expect(bulle).toHaveTextContent("Une lame fiable.");
    expect(bulle).toHaveTextContent("Poids");
    expect(bulle).toHaveTextContent("1,5 kg");
    expect(bulle).toHaveTextContent("Dégâts");
  });

  it("sans catalogue chargé, la copie de la fiche n'a pas de propriétés", () => {
    render(<SkillsFieldView items={[{ id: "s1", catalog_id: "c-forge", name: "Forge", level: "3" }]} />);
    expect(screen.getByText("Forge")).toBeInTheDocument();
    expect(screen.queryByText("Prérequis")).toBeNull();
    expect(document.querySelector("dl")).toBeNull();
  });
});
