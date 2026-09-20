import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { indexCatalog } from "@/lib/worldCatalog";
import type { WorldCatalogItem } from "@/types/worlds";
import type { CatalogRelation } from "@/lib/catalogRelations";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/worlds/wiki/WikiLinkContext", () => ({ useWikiLinks: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const actions = vi.hoisted(() => ({
  setWorldCatalogItemPages: vi.fn().mockResolvedValue({ ok: true }),
  setWorldCatalogItemRelations: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/app/actions/worldCatalog", () => actions);

import { CatalogItemDetail } from "@/components/worlds/catalogue/CatalogItemDetail";
import { CatalogItemDialog } from "@/components/worlds/catalogue/CatalogItemDialog";
import { SkillsField } from "@/components/personas/fields/SkillsField";

const skill = (id: string, name: string): WorldCatalogItem => ({ id, world_id: "w1", type: "skills", name, sort_index: 0 });
const item = (id: string, name: string): WorldCatalogItem => ({ id, world_id: "w1", type: "inventory", name, sort_index: 0 });

const FORGE = skill("forge", "Forge");
const AVANCEE = skill("avancee", "Forge avancée");
const MAITRE = skill("maitre", "Maître forgeron");
const SKILLS = [FORGE, AVANCEE, MAITRE];
const PREREQS: CatalogRelation[] = [
  { from_id: "avancee", to_id: "forge", kind: "prerequisite", quantity: 1, sort_index: 0 },
  { from_id: "maitre", to_id: "avancee", kind: "prerequisite", quantity: 1, sort_index: 0 },
];

const EPEE = item("epee", "Épée");
const LINGOT = item("lingot", "Lingot");
const MINERAI = item("minerai", "Minerai");
const CUIR = item("cuir", "Cuir");
const ITEMS = [EPEE, LINGOT, MINERAI, CUIR];
const RECIPE: CatalogRelation[] = [
  { from_id: "epee", to_id: "lingot", kind: "ingredient", quantity: 2, sort_index: 0 },
  { from_id: "epee", to_id: "cuir", kind: "ingredient", quantity: 1, sort_index: 1 },
  { from_id: "lingot", to_id: "minerai", kind: "ingredient", quantity: 3, sort_index: 0 },
];

function mockResults(results: { data: unknown }[]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("SkillsField — prérequis contraignants (migration 187)", () => {
  it("le sélecteur grise une compétence dont un prérequis manque, et dit lequel", async () => {
    mockResults([{ data: PREREQS }]);
    const user = userEvent.setup();
    render(<SkillsField initialItems={[]} onSave={vi.fn()} catalogItems={SKILLS} />);
    await user.click(screen.getByRole("button", { name: /ajouter depuis le catalogue/i }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Forge avancée/ })).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: /Forge avancée/ })).toHaveAttribute("title", "Prérequis manquants : Forge");
    expect(within(dialog).getByRole("button", { name: /^Forge$/ })).toBeEnabled();
    // « Maître forgeron » n'exige que « Forge avancée », directement.
    expect(within(dialog).getByRole("button", { name: /Maître forgeron/ })).toHaveAttribute("title", "Prérequis manquants : Forge avancée");
  });

  it("une fois le prérequis sur la fiche, la compétence se choisit ; un prérequis retiré se signale", async () => {
    mockResults([{ data: PREREQS }]);
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <SkillsField initialItems={[{ id: "x", catalog_id: "forge", name: "Forge", level: "" }]} onSave={onSave} catalogItems={SKILLS} />,
    );
    await user.click(screen.getByRole("button", { name: /ajouter depuis le catalogue/i }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Forge avancée/ })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: /Forge avancée/ }));
    expect(onSave).toHaveBeenLastCalledWith([expect.objectContaining({ catalog_id: "forge" }), expect.objectContaining({ catalog_id: "avancee" })]);

    // La fiche perd « Forge » (autre chemin) : « Forge avancée » porte l'avertissement.
    mockResults([{ data: PREREQS }]);
    rerender(<SkillsField key="2" initialItems={[{ id: "y", catalog_id: "avancee", name: "Forge avancée", level: "" }]} onSave={onSave} catalogItems={SKILLS} />);
    expect(await screen.findByText("Prérequis manquant")).toHaveAttribute("title", "Prérequis manquants : Forge");
  });
});

describe("CatalogItemDetail — prérequis et recette", () => {
  it("une compétence liste ses prérequis et ce qu'elle débloque ; un clic ouvre l'autre fiche", async () => {
    // pages liées, relations
    mockResults([{ data: [] }, { data: PREREQS }]);
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<CatalogItemDetail item={AVANCEE} catalog={indexCatalog(SKILLS)} onNavigate={onNavigate} open onOpenChange={() => {}} />);
    const prereqs = await screen.findByTestId("prerequisites");
    expect(within(prereqs).getByText("Forge")).toBeInTheDocument();
    expect(within(screen.getByTestId("unlocks")).getByText("Maître forgeron")).toBeInTheDocument();
    await user.click(within(prereqs).getByRole("button", { name: /Forge/ }));
    expect(onNavigate).toHaveBeenCalledWith(FORGE);
  });

  it("un objet montre sa composition en arbre dépliable, avec les quantités, et où il entre", async () => {
    mockResults([{ data: [] }, { data: RECIPE }]);
    const user = userEvent.setup();
    render(<CatalogItemDetail item={EPEE} catalog={indexCatalog(ITEMS)} open onOpenChange={() => {}} />);
    const recipe = await screen.findByTestId("recipe");
    expect(within(recipe).getByText("Lingot")).toBeInTheDocument();
    expect(within(recipe).getByText("× 2")).toBeInTheDocument();
    expect(within(recipe).getByText("Cuir")).toBeInTheDocument();
    // Le second niveau se déplie à la demande.
    expect(within(recipe).queryByText("Minerai")).toBeNull();
    await user.click(within(recipe).getByRole("button", { name: "Déplier Lingot" }));
    expect(within(recipe).getByText("Minerai")).toBeInTheDocument();
    expect(within(recipe).getByText("× 3")).toBeInTheDocument();
    expect(screen.queryByTestId("used-in")).toBeNull();
  });

  it("un ingrédient dit dans quoi il entre, en complétant le catalogue fourni", async () => {
    // pages liées, relations, puis les objets manquants du catalogue (Épée)
    mockResults([{ data: [] }, { data: RECIPE }, { data: [EPEE] }]);
    render(<CatalogItemDetail item={LINGOT} catalog={indexCatalog([LINGOT, MINERAI])} open onOpenChange={() => {}} />);
    const usedIn = await screen.findByTestId("used-in");
    await waitFor(() => expect(within(usedIn).getByText("Épée")).toBeInTheDocument());
    expect(within(usedIn).getByText("× 2")).toBeInTheDocument();
  });
});

describe("CatalogItemDialog — composition d'un objet", () => {
  const CUIR_ONLY = [{ from_id: "epee", to_id: "cuir", kind: "ingredient", quantity: 1, sort_index: 0 }];

  it("ajoute un ingrédient, règle sa quantité et enregistre les relations", async () => {
    // pages liées, relations (le sélecteur de pages, dans le portail, vient ensuite)
    mockResults([{ data: [] }, { data: CUIR_ONLY }, { data: [] }]);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CatalogItemDialog item={{ ...EPEE, category_id: null }} type="inventory" worldId="w1" open
        onOpenChange={vi.fn()} onSave={onSave} siblings={ITEMS} />,
    );
    expect(await screen.findByText("Cuir")).toBeInTheDocument();
    // Le sélecteur (Popover) par-dessus le dialogue modal : `fireEvent` pour
    // l'ouvrir, jsdom ne calculant pas les styles hérités (voir CatalogItemDialog.create.test).
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un ingrédient" }));
    await user.click(await screen.findByRole("option", { name: /Lingot/ }));
    expect(await screen.findByText("Lingot")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Plus" })[1]);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(actions.setWorldCatalogItemRelations).toHaveBeenCalledWith("epee", "ingredient", [
      { to_id: "cuir", quantity: 1 },
      { to_id: "lingot", quantity: 2 },
    ]));
  });

  it("le sélecteur écarte l'objet lui-même et les ingrédients déjà retenus", async () => {
    mockResults([{ data: [] }, { data: [...CUIR_ONLY, { from_id: "epee", to_id: "lingot", kind: "ingredient", quantity: 2, sort_index: 1 }] }, { data: [] }]);
    render(
      <CatalogItemDialog item={{ ...EPEE, category_id: null }} type="inventory" worldId="w1" open
        onOpenChange={vi.fn()} onSave={vi.fn()} siblings={ITEMS} />,
    );
    expect(await screen.findByText("Lingot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un ingrédient" }));
    await screen.findByRole("option", { name: /Minerai/ });
    expect(screen.queryByRole("option", { name: /Épée/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Cuir/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Lingot/ })).toBeNull();
  });
});
