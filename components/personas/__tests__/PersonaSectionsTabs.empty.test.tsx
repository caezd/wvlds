import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PersonaSectionsTabs } from "@/components/personas/PersonaSectionsTabs";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const erreurToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: erreurToast, success: vi.fn() } }));

// L'éditeur de champs d'un onglet n'a rien à voir avec l'état vide, et tire
// tout un arbre de dépendances derrière lui.
vi.mock("@/components/personas/SectionFieldsEditor", () => ({
  SectionFieldsEditor: () => <div data-testid="champs" />,
}));

const brancher = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockReturnValue(mock.client as never);

function poser(mock: ReturnType<typeof createSupabaseMock>) {
  brancher(mock);
  const onSectionsChange = vi.fn();
  render(
    <PersonaSectionsTabs
      personaId="p1"
      userId="u1"
      sections={[]}
      onSectionsChange={onSectionsChange}
    />,
  );
  return onSectionsChange;
}

beforeEach(() => vi.clearAllMocks());

describe("PersonaSectionsTabs — profil sans aucun onglet", () => {
  it("propose de quoi démarrer, pas seulement le constat d'une fiche vide", () => {
    poser(createSupabaseMock());

    expect(screen.getByText("Aucun onglet pour ce personnage.")).toBeInTheDocument();
    for (const nom of ["+ Informations", "+ Apparence", "+ Histoire"]) {
      expect(screen.getByRole("button", { name: nom })).toBeInTheDocument();
    }
  });

  // Devant une fiche vierge, devoir inventer un nom avant même d'avoir vu à
  // quoi sert un onglet est une marche de plus : les suggestions créent en un
  // clic, et le nom se change ensuite d'un « Renommer ».
  it("crée un premier onglet en un clic depuis une suggestion", async () => {
    const mock = createSupabaseMock({
      results: [{ data: { id: "s1", persona_id: "p1", name: "Apparence", position: 10 } }],
    });
    const onSectionsChange = poser(mock);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Apparence" }));

    await waitFor(() =>
      expect(onSectionsChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: "s1", name: "Apparence", fields: [] }),
      ]),
    );
    expect(mock.buildersFor("persona_sections")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ persona_id: "p1", name: "Apparence" }),
    );
  });

  it("laisse choisir un nom libre, sans passer par une suggestion", async () => {
    poser(createSupabaseMock());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Autre nom…" }));

    // Ciblé par rôle : « Nom de l'onglet » nomme à la fois le champ et le
    // dialogue qui le contient (via aria-labelledby).
    expect(screen.getByRole("textbox", { name: "Nom de l’onglet" })).toBeInTheDocument();
  });

  // Régression : un échec de création ne laissait qu'une trace en console —
  // rien à l'écran — alors que renommer et supprimer signalent tous deux leur
  // erreur. L'utilisateur voyait son clic ne rien produire, sans explication.
  it("signale un échec de création au lieu de ne rien faire", async () => {
    poser(createSupabaseMock({ results: [{ error: { message: "insert refusé" } }] }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Informations" }));

    await waitFor(() => expect(erreurToast).toHaveBeenCalledWith("insert refusé"));
  });
});
