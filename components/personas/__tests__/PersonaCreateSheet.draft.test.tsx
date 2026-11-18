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
vi.mock("@/components/providers/WorldMembershipProvider", () => ({ useWorldMembership: () => ({ can: () => false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const createPersona = vi.fn(async () => ({ ok: true, id: "p-neuf" }));
vi.mock("@/app/(protected)/p/actions", () => ({
  createPersona: (...a: unknown[]) => createPersona(...(a as [])),
  deletePersona: vi.fn(),
}));
vi.mock("@/lib/personaSections", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchPersonaSections: vi.fn(async () => []),
}));

import { PersonaCreateSheet } from "@/components/personas/PersonaCreateSheet";

async function creer(mock: ReturnType<typeof createSupabaseMock>) {
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const user = userEvent.setup();
  render(<PersonaCreateSheet />);
  await user.click(screen.getByRole("button", { name: "Nouveau persona" }));
  await user.type(screen.getByLabelText("Nom"), "Kael");
  await user.click(screen.getByRole("button", { name: /Créer et configurer/ }));
  await screen.findByPlaceholderText("Nom du personnage");
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PersonaCreateSheet — un bouton « Enregistrer » en bas, comme l'édition", () => {
  it("rien ne part avant « Enregistrer », puis tout part en UNE requête", async () => {
    const mock = createSupabaseMock();
    const user = await creer(mock);

    const enregistrer = screen.getByRole("button", { name: "Enregistrer" });
    expect(enregistrer).toBeDisabled();

    const nom = screen.getByPlaceholderText("Nom du personnage");
    await user.clear(nom);
    await user.type(nom, "Kaela");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.buildersFor("personas")).toHaveLength(0);

    await waitFor(() => expect(enregistrer).toBeEnabled());
    await user.click(enregistrer);

    await waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(1));
    expect(mock.rpc).toHaveBeenCalledWith("save_persona_sheet", expect.objectContaining({
      p_persona_id: "p-neuf",
      p_patch: { name: "Kaela" },
    }));
  });

  it("fermer avec des modifications en attente demande quoi en faire", async () => {
    const mock = createSupabaseMock();
    const user = await creer(mock);

    await user.type(screen.getByPlaceholderText("Nom du personnage"), "a");
    await user.keyboard("{Escape}");

    expect(await screen.findByText("Modifications non enregistrées")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(screen.queryByPlaceholderText("Nom du personnage")).toBeNull());
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
