import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const currentUserMock = vi.hoisted(() => ({ plan: "free" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ plan: currentUserMock.plan }),
}));

const membership = vi.hoisted(() => ({ canPlayNpc: false }));
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({ worldId: "w1", can: (perm: string) => perm === "npc.play" && membership.canPlayNpc }),
}));

import { PersonaProfileSheet } from "@/components/chatrooms/persona/PersonaProfileSheet";

const persona: Persona = {
  id: "p6",
  user_id: "u1",
  name: "Zeta",
  avatar_url: null,
};

// 6 personas non-templates du même monde pour u1 ; p6 est le plus récent
// (6e rang) -> inéligible en plan gratuit.
const siblings = [
  { id: "p1", created_at: "2026-01-01T00:00:00Z", is_template: false },
  { id: "p2", created_at: "2026-01-02T00:00:00Z", is_template: false },
  { id: "p3", created_at: "2026-01-03T00:00:00Z", is_template: false },
  { id: "p4", created_at: "2026-01-04T00:00:00Z", is_template: false },
  { id: "p5", created_at: "2026-01-05T00:00:00Z", is_template: false },
  { id: "p6", created_at: "2026-01-06T00:00:00Z", is_template: false },
];

// La requête "siblings" (éligibilité) n'est déclenchée que pour SON PROPRE
// persona (user_id === selfId) — la file de résultats doit refléter
// exactement la séquence réelle des requêtes pour chaque scénario.
function setup(plan: string | null = "free", ownsPersona = true) {
  currentUserMock.plan = plan;
  const mock = createSupabaseMock({
    results: [
      { data: { banner_url: null, frame: null, world_id: "w1" } }, // personaRow
      ...(ownsPersona ? [{ data: siblings }] : []), // siblings (éligibilité, si propriétaire)
      { data: null }, // profiles (owner presence)
      { data: [] }, // persona_sections
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  membership.canPlayNpc = false;
});

describe("PersonaProfileSheet — PNJ partagé (migration 182)", () => {
  const npc: Persona = { id: "npc-1", user_id: "u9", name: "Aubergiste", avatar_url: null, is_npc: true, review_status: "approved", sheet_complete: true };

  it("sans « Jouer les PNJ », le bouton est verrouillé et la raison le dit", async () => {
    setup("free", /* ownsPersona */ false);
    render(<PersonaProfileSheet persona={npc} selfId="u1" onClose={() => {}} onUsePersona={() => {}} />);
    await screen.findByRole("button", { name: /utiliser ce persona/i });
    await waitFor(() => expect(screen.getByRole("button", { name: /utiliser ce persona/i })).toBeDisabled());
    expect(screen.getByText("PNJ")).toBeInTheDocument();
  });

  it("avec la permission, un PNJ validé se joue, quel que soit le quota", async () => {
    membership.canPlayNpc = true;
    currentUserMock.plan = "free";
    const mock = createSupabaseMock({
      results: [
        { data: { banner_url: null, frame: null, world_id: "w1" } },
        { data: [...siblings, npc] }, // les siens (6, quota dépassé) + le PNJ
        { data: null },
        { data: [] },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<PersonaProfileSheet persona={npc} selfId="u1" onClose={() => {}} onUsePersona={() => {}} />);
    await screen.findByRole("button", { name: /utiliser ce persona/i });
    await waitFor(() => expect(screen.getByRole("button", { name: /utiliser ce persona/i })).not.toBeDisabled());
  });
});

describe("PersonaProfileSheet — verrouillage du bouton « Utiliser ce persona »", () => {
  it("désactive le bouton pour son propre persona au-delà du quota gratuit", async () => {
    setup("free");
    render(
      <PersonaProfileSheet
        persona={persona}
        selfId="u1"
        onClose={() => {}}
        onUsePersona={() => {}}
      />,
    );

    await screen.findByRole("button", { name: /utiliser ce persona/i });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /utiliser ce persona/i })).toBeDisabled();
    });
  });

  it("laisse le bouton actif pour un compte abonné", async () => {
    setup("subscribed");
    render(
      <PersonaProfileSheet
        persona={persona}
        selfId="u1"
        onClose={() => {}}
        onUsePersona={() => {}}
      />,
    );

    await screen.findByRole("button", { name: /utiliser ce persona/i });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /utiliser ce persona/i })).not.toBeDisabled();
    });
  });

  it("ne restreint pas la consultation du persona d'un autre joueur (pas de bouton concerné)", async () => {
    setup("free", /* ownsPersona */ false);
    const otherPersona: Persona = { ...persona, user_id: "someone-else" };
    render(
      <PersonaProfileSheet
        persona={otherPersona}
        selfId="u1"
        onClose={() => {}}
        onUsePersona={() => {}}
      />,
    );

    // Le bouton "Utiliser" n'est jamais désactivé pour un persona qu'on ne
    // possède pas soi-même : l'éligibilité ne s'applique qu'à ses propres
    // personas (cf. migration 090 / owns_persona).
    await screen.findByRole("button", { name: /utiliser ce persona/i });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /utiliser ce persona/i })).not.toBeDisabled();
    });
  });
});
