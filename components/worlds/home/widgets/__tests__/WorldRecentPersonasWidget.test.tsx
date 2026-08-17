import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const mockGetUserPresence = vi.fn(() => "offline" as const);
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: mockGetUserPresence }),
}));

vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({
    personaId,
    children,
  }: {
    personaId: string;
    children: React.ReactNode;
  }) => <button type="button" data-testid={`persona-trigger-${personaId}`}>{children}</button>,
}));

import { WorldRecentPersonasWidget } from "@/components/worlds/home/widgets/WorldRecentPersonasWidget";

function setup(personas: unknown[]) {
  const mock = createSupabaseMock({ results: [{ data: personas }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldRecentPersonasWidget", () => {
  it("n'affiche rien quand le monde n'a pas de personas", async () => {
    setup([]);
    const { container } = render(<WorldRecentPersonasWidget worldId="w1" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("liste les personas récentes avec leur nom", async () => {
    setup([
      { id: "p1", user_id: "u1", name: "Aria", avatar_url: null, faceclaim: null, frame: null },
      { id: "p2", user_id: "u2", name: "Boros", avatar_url: null, faceclaim: null, frame: null },
    ]);
    render(<WorldRecentPersonasWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByTestId("persona-trigger-p1")).toHaveTextContent("Aria");
    });
    expect(screen.getByTestId("persona-trigger-p2")).toHaveTextContent("Boros");
  });

  it("requête personas filtrée sur le monde, hors modèles et supprimées, triée par création desc", async () => {
    const mock = setup([]);
    render(<WorldRecentPersonasWidget worldId="w1" />);

    await waitFor(() => expect(mock.buildersFor("personas")).toHaveLength(1));
    const builder = mock.buildersFor("personas")[0];
    expect(builder.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(builder.eq).toHaveBeenCalledWith("is_template", false);
    expect(builder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
