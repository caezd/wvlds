import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegionPanel } from "@/components/worlds/map/RegionPanel";
import { makeRegion, WIKI_PAGES } from "./fixtures";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const updateMapRegion = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/actions/worldMap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/actions/worldMap")>()),
  updateMapRegion,
}));

// L'éditeur de paragraphe charge tout le composeur : un champ suffit ici.
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));
// Le choix de couleur a ses propres tests : un champ texte suffit.
vi.mock("@/components/worlds/map/ColorInput", () => ({
  ColorInput: ({ color, onChange }: { color: string; onChange: (hex: string) => void }) => (
    <input aria-label="Couleur" value={color} onChange={e => onChange(e.target.value)} />
  ),
}));

function monter(isEditMode = false, region = makeRegion()) {
  const onUpdated = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <RegionPanel
      region={region}
      wikiPages={WIKI_PAGES}
      isEditMode={isEditMode}
      worldId="w1"
      onClose={onClose}
      onUpdated={onUpdated}
      onDelete={onDelete}
    />,
  );
  return { onUpdated, onDelete, onClose };
}

beforeEach(() => {
  pushMock.mockReset();
  updateMapRegion.mockClear();
});

describe("RegionPanel", () => {
  it("nomme la région et avoue qu'elle n'a pas de description", () => {
    monter();
    expect(screen.getByRole("dialog", { name: "Région" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Le royaume" })).toBeInTheDocument();
    expect(screen.getByText("Aucune description.")).toBeInTheDocument();
  });

  it("mène à la page du wiki qu'elle raconte", async () => {
    monter(false, makeRegion({ wiki_page_id: "p1" }));
    await userEvent.click(screen.getByRole("button", { name: /Ouvrir la page du wiki/ }));
    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=wiki&page=arkham");
  });

  it("enregistre nom, description, couleur et page en édition", async () => {
    const { onUpdated } = monter(true);
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    const nom = screen.getByRole("textbox", { name: "Nom de la région" });
    await userEvent.clear(nom);
    await userEvent.type(nom, "L'empire");
    await userEvent.type(screen.getByRole("textbox", { name: "Description du lieu…" }), "Vaste.");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Page du wiki" }), "p2");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    const attendu = { label: "L'empire", description: "Vaste.", color: "#22c55e", wiki_page_id: "p2" };
    expect(updateMapRegion).toHaveBeenCalledWith("reg1", attendu);
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining(attendu));
  });

  it("refuse un nom vide", async () => {
    monter(true);
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Nom de la région" }));
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("demande confirmation avant de supprimer", async () => {
    const { onDelete } = monter(true);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer cette région" }));
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "reg1" }));
  });

  it("ne propose rien à modifier en lecture", () => {
    monter(false);
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer cette région" })).toBeNull();
  });

  it("se ferme", async () => {
    const { onClose } = monter();
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalled();
  });
});
