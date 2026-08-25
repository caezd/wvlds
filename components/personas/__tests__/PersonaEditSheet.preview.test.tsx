import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { PersonaSectionWithFields } from "@/types/personas";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ avatar_builder: false }),
}));

import { PersonaEditorContent } from "@/components/personas/PersonaEditSheet";

const sections: PersonaSectionWithFields[] = [
  {
    id: "s1",
    persona_id: "p1",
    name: "Profil",
    position: 0,
    fields: [
      { id: "f1", section_id: "s1", type: "title", position: 0, data: { text: "Bonjour" } },
    ],
  },
];

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  const mock = createSupabaseMock({ user: { id: "u1" } });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
});

describe("PersonaEditorContent — bascule aperçu", () => {
  it("passe du rendu éditable au rendu lecture seule (et inversement) au clic sur « Aperçu »", async () => {
    const user = userEvent.setup();
    render(
      <PersonaEditorContent
        personaId="p1"
        personaName="Kael"
        sections={sections}
        onSectionsChange={vi.fn()}
      />,
    );

    // Mode édition par défaut : le nom est un champ modifiable.
    expect(screen.getByPlaceholderText("Nom du personnage")).toHaveValue("Kael");
    expect(screen.queryByText("Bonjour")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aperçu" }));

    // Mode aperçu : le nom redevient du texte statique, le champ "title" de
    // la section se rend via FieldView (même moteur que la fiche publique).
    expect(screen.queryByPlaceholderText("Nom du personnage")).not.toBeInTheDocument();
    expect(screen.getByText("Kael")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bonjour" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Éditer" }));

    expect(screen.getByPlaceholderText("Nom du personnage")).toHaveValue("Kael");
    expect(screen.queryByText("Bonjour")).not.toBeInTheDocument();
  });
});
