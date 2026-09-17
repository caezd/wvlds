import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

// ──────────────────────────────────────────────────────────────────────────
// La création d'un monde pose `owner_id` : l'id venait de `auth.getUser()`.
// Sous Firefox, cet appel attend le verrou de session de supabase-js
// (navigator.locks) qu'un autre onglet peut retenir — le monde n'était alors
// jamais créé. L'id vient du contexte ; la policy d'insertion vérifie de toute
// façon que `owner_id` est l'appelant.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const moi = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: moi.userId }),
}));

import { CreateWorldDialog } from "@/components/sidebar/CreateWorldDialog";

function setup() {
  const mock = createSupabaseMock({ results: [{ data: { id: "w9" }, error: null }] });
  // La session est tenue par un autre onglet : `getUser()` ne rend jamais la
  // main. La création ne doit pas l'attendre.
  mock.client.auth.getUser.mockReturnValue(new Promise(() => {}));
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

async function remplirEtCreer() {
  const user = userEvent.setup();
  render(<CreateWorldDialog plan="free" ownedCount={0} quotaLimit={3} />);
  await user.click(screen.getByRole("button", { name: "Nouveau monde" }));
  await user.type(await screen.findByLabelText("Nom du monde"), "Avalonia");
  await user.click(screen.getByRole("button", { name: "Créer" }));
}

describe("CreateWorldDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moi.userId = "u1";
  });

  it("crée le monde au nom de l'utilisateur du contexte, sans consulter la session", async () => {
    const mock = setup();

    await remplirEtCreer();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/w9"));
    const [builder] = mock.buildersFor("worlds");
    expect(builder.insert).toHaveBeenCalledWith({ owner_id: "u1", name: "Avalonia", description: "" });
    expect(mock.client.auth.getUser).not.toHaveBeenCalled();
  });

  it("ne tente rien sans utilisateur dans le contexte", async () => {
    moi.userId = null;
    const mock = setup();

    await remplirEtCreer();

    expect(mock.buildersFor("worlds")).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
});
