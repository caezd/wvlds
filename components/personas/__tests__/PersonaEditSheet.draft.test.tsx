import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => ({ avatar_builder: false }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));
vi.mock("@/hooks/useWorldFaceclaimRule", () => ({ useWorldFaceclaimRule: () => ({ enabled: true, required: false }) }));
vi.mock("@/hooks/useWorldReviewActive", () => ({ useWorldReviewActive: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Les sections rechargées après l'écriture : le contenu importe peu ici.
vi.mock("@/lib/personaSections", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchPersonaSections: vi.fn(async () => []),
}));

import { PersonaEditSheet } from "@/components/personas/PersonaEditSheet";
import type { PersonaSectionWithFields } from "@/types/personas";

function monter(mock: ReturnType<typeof createSupabaseMock>, sections: PersonaSectionWithFields[] = []) {
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return render(
    <PersonaEditSheet
      personaId="p1"
      personaName="Kael"
      initialSections={sections}
      initialFaceclaim="Emma Stone"
      openOnMount
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PersonaEditSheet — rien ne part avant « Enregistrer »", () => {
  it("le bouton n'apparaît qu'une fois la fiche modifiée, et écrit tout d'un coup", async () => {
    const mock = createSupabaseMock();
    const user = userEvent.setup();
    monter(mock);

    // Fiche intacte : pas de bouton.
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();

    const nom = screen.getByPlaceholderText("Nom du personnage");
    await user.clear(nom);
    await user.type(nom, "Kaela");
    // La frappe n'écrit rien.
    expect(mock.buildersFor("personas")).toHaveLength(0);

    const enregistrer = await screen.findByRole("button", { name: "Enregistrer" });
    await user.click(enregistrer);

    await waitFor(() => expect(mock.buildersFor("personas")).toHaveLength(1));
    expect(mock.buildersFor("personas")[0].update).toHaveBeenCalledWith({ name: "Kaela" });
    expect(refresh).toHaveBeenCalled();
    // Écrite, la fiche est propre : le bouton disparaît.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull());
  });

  it("revenir à la valeur d'origine range le brouillon", async () => {
    const mock = createSupabaseMock();
    const user = userEvent.setup();
    monter(mock);

    const nom = screen.getByPlaceholderText("Nom du personnage");
    await user.type(nom, "a");
    await screen.findByRole("button", { name: "Enregistrer" });

    await user.type(nom, "{Backspace}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull());
  });

  it("fermer avec des modifications en attente demande quoi en faire", async () => {
    const mock = createSupabaseMock();
    const user = userEvent.setup();
    monter(mock);

    await user.type(screen.getByPlaceholderText("Nom du personnage"), "b");
    await user.keyboard("{Escape}");

    // La fiche reste ouverte, la question est posée.
    expect(await screen.findByText("Modifications non enregistrées")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nom du personnage")).toBeInTheDocument();

    // Abandonner ferme sans rien écrire.
    await user.click(screen.getByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(screen.queryByPlaceholderText("Nom du personnage")).toBeNull());
    expect(mock.buildersFor("personas")).toHaveLength(0);
  });

  it("fiche intacte : la fermeture ne demande rien", async () => {
    const mock = createSupabaseMock();
    const user = userEvent.setup();
    monter(mock);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByPlaceholderText("Nom du personnage")).toBeNull());
    expect(screen.queryByText("Modifications non enregistrées")).toBeNull();
  });
});

describe("PersonaEditSheet — les sections aussi attendent", () => {
  const SECTIONS: PersonaSectionWithFields[] = [
    {
      id: "s1", persona_id: "p1", name: "Identité", position: 0,
      fields: [{ id: "f1", section_id: "s1", type: "title", position: 0, data: { text: "Origines" } }],
    },
  ];

  it("modifier un champ n'écrit rien, et « Enregistrer » le porte en base", async () => {
    const mock = createSupabaseMock();
    const user = userEvent.setup();
    monter(mock, SECTIONS);

    const champ = await screen.findByPlaceholderText("Titre…");
    await user.clear(champ);
    await user.type(champ, "E");

    // Dès la première lettre, la fiche se sait modifiée…
    await screen.findByRole("button", { name: "Enregistrer" });
    await user.type(champ, "nfance");
    await user.tab();

    // …mais rien n'est parti en base, ni à la frappe ni à la sortie du champ.
    expect(mock.buildersFor("persona_section_fields")).toHaveLength(0);

    await user.click(await screen.findByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mock.buildersFor("persona_section_fields")).toHaveLength(1));
    expect(mock.buildersFor("persona_section_fields")[0].update).toHaveBeenCalledWith({ data: { text: "Enfance" } });
  });
});
