import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

// Stub minimal : rend directement le trigger fourni, sans le vrai Sheet de
// création (formulaire, appel serveur…) — seul le rendu du CTA est testé ici.
vi.mock("@/components/personas/PersonaCreateSheet", () => ({
  PersonaCreateSheet: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

import { WorldPersonasPanel } from "@/components/personas/WorldPersonasPanel";

function setup() {
  const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

describe("WorldPersonasPanel — CTA de création dans l'en-tête", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche un bouton explicite « Nouveau persona », pas seulement une icône", async () => {
    setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);

    const button = await screen.findByRole("button", { name: "Nouveau persona" });
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain("Nouveau persona");
  });
});
