import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { PersonaSectionWithFields } from "@/types/personas";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ avatar_builder: false }),
}));

// La règle du monde (migration 191) : le champ n'existe que si le monde s'en sert.
const faceclaims = vi.hoisted(() => ({ rule: { enabled: true, required: false } as { enabled: boolean; required: boolean } | null }));
vi.mock("@/hooks/useWorldFaceclaimRule", () => ({ useWorldFaceclaimRule: () => faceclaims.rule }));

import { PersonaEditorContent } from "@/components/personas/PersonaEditSheet";

const sections: PersonaSectionWithFields[] = [
  { id: "s1", persona_id: "p1", name: "Profil", position: 0, fields: [] },
];

function monter(props: Partial<React.ComponentProps<typeof PersonaEditorContent>> = {}) {
  return render(
    <PersonaEditorContent
      personaId="p1"
      personaName="Kael"
      sections={sections}
      onSectionsChange={vi.fn()}
      onPatch={vi.fn()}
      worldId="w1"
      initialFaceclaim="Emma Stone"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue(createSupabaseMock({ user: { id: "u1" } }).client as never);
  faceclaims.rule = { enabled: true, required: false };
});

describe("PersonaEditorContent — le faceclaim suit le monde", () => {
  it("le monde s'en sert : le champ est là, rempli", () => {
    monter();
    expect(screen.getByPlaceholderText("acteur/perso")).toHaveValue("Emma Stone");
  });

  it("le monde les a coupés : plus de champ à remplir", () => {
    faceclaims.rule = { enabled: false, required: false };
    monter();
    expect(screen.queryByPlaceholderText("acteur/perso")).toBeNull();
  });

  it("la prop de l'appelant suffit à masquer le champ, sans attendre le monde", () => {
    // Certains appelants connaissent déjà le réglage : le champ ne doit pas
    // clignoter le temps que la règle arrive.
    faceclaims.rule = null;
    monter({ faceclaimsEnabled: false });
    expect(screen.queryByPlaceholderText("acteur/perso")).toBeNull();
  });
});
