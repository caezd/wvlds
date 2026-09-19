import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

// ──────────────────────────────────────────────────────────────────────────
// L'éditeur de la fiche modèle envoie des images sous le préfixe
// `user-{id}/…` : il lui faut l'id de qui édite. Il venait de
// `auth.getUser()`, appelé à l'ouverture — sous Firefox, cet appel attend le
// verrou de session de supabase-js (navigator.locks) qu'un autre onglet peut
// retenir, et l'éditeur ne s'ouvrait alors jamais. L'id vient du contexte.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/worldCatalog", () => ({
  getWorldPersonaTemplate: vi.fn().mockResolvedValue({ ok: true, templateId: "tpl1" }),
  setWorldPersonaTemplate: vi.fn().mockResolvedValue({ ok: true }),
}));
const fetchPersonaSections = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/personaSections", () => ({ fetchPersonaSections }));
// Ce qui se vérifie ici est ce que la section transmet à l'éditeur, pas ce
// qu'il affiche.
vi.mock("@/components/personas/PersonaSectionsTabs", () => ({
  PersonaSectionsTabs: ({ personaId, userId }: { personaId: string; userId: string | null }) => (
    <div data-testid="sections-tabs" data-persona={personaId} data-user={userId ?? ""} />
  ),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1" }),
}));

const setWorldReviewActiveCache = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useWorldReviewActive", () => ({ setWorldReviewActiveCache }));

import { WorldPersonaTemplateSection } from "@/components/worlds/settings/WorldPersonaTemplateSection";
import { getWorldPersonaTemplate } from "@/app/actions/worldCatalog";

function setup() {
  const mock = createSupabaseMock();
  // La session est tenue par un autre onglet : `getUser()` ne rend jamais la
  // main. L'ouverture de l'éditeur ne doit pas l'attendre.
  mock.client.auth.getUser.mockReturnValue(new Promise(() => {}));
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

describe("WorldPersonaTemplateSection — ouverture de l'éditeur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPersonaSections.mockResolvedValue([]);
  });

  it("ouvre l'éditeur avec l'id du contexte, sans consulter la session", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldPersonaTemplateSection worldId="w1" />);

    await user.click(await screen.findByRole("button", { name: "Éditer la fiche" }));

    const tabs = await screen.findByTestId("sections-tabs");
    expect(tabs).toHaveAttribute("data-persona", "tpl1");
    expect(tabs).toHaveAttribute("data-user", "u1");
    expect(fetchPersonaSections).toHaveBeenCalledWith(mock.client, "tpl1");
    expect(mock.client.auth.getUser).not.toHaveBeenCalled();
  });
});

describe("WorldPersonaTemplateSection — validation des fiches (migration 184)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorldPersonaTemplate).mockResolvedValue({ ok: true, templateId: "tpl1" });
  });

  it("la bascule vit sous la fiche par défaut, écrit l'option et prévient le parent", async () => {
    const mock = setup();
    const user = userEvent.setup();
    const onReviewEnabledChange = vi.fn();
    render(<WorldPersonaTemplateSection worldId="w1" reviewEnabled={false} onReviewEnabledChange={onReviewEnabledChange} />);

    const toggle = await screen.findByRole("switch", { name: "Validation des fiches" });
    await user.click(toggle);

    const builder = mock.buildersFor("worlds")[0];
    expect(builder.update).toHaveBeenCalledWith({ persona_review_enabled: true });
    expect(builder.eq).toHaveBeenCalledWith("id", "w1");
    expect(onReviewEnabledChange).toHaveBeenCalledWith(true);
    // La mémoire du client apprend la valeur effective : option ET modèle.
    expect(setWorldReviewActiveCache).toHaveBeenCalledWith("w1", true);
  });

  it("sans fiche par défaut, pas de bascule : l'option n'aurait aucun effet", async () => {
    vi.mocked(getWorldPersonaTemplate).mockResolvedValue({ ok: true, templateId: null });
    setup();
    render(<WorldPersonaTemplateSection worldId="w1" reviewEnabled />);
    await screen.findByText("Fiche par défaut");
    expect(screen.queryByRole("switch", { name: "Validation des fiches" })).toBeNull();
  });
});
