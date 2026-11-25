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
import { getWorldPersonaTemplate, setWorldPersonaTemplate } from "@/app/actions/worldCatalog";

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
    render(<WorldPersonaTemplateSection title="Fiche par défaut" worldId="w1" />);

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
    render(<WorldPersonaTemplateSection title="Fiche par défaut" worldId="w1" reviewEnabled={false} onReviewEnabledChange={onReviewEnabledChange} />);

    const toggle = await screen.findByRole("switch", { name: "Validation des fiches" });
    await user.click(toggle);

    const builder = mock.buildersFor("worlds")[0];
    expect(builder.update).toHaveBeenCalledWith({ persona_review_enabled: true });
    expect(builder.eq).toHaveBeenCalledWith("id", "w1");
    expect(onReviewEnabledChange).toHaveBeenCalledWith(true);
    // La mémoire du client apprend la valeur effective : option ET modèle.
    expect(setWorldReviewActiveCache).toHaveBeenCalledWith("w1", true);
  });

  it("sans fiche par défaut, ses options restent lisibles mais inertes : elles n'auraient aucun effet", async () => {
    vi.mocked(getWorldPersonaTemplate).mockResolvedValue({ ok: true, templateId: null });
    const user = userEvent.setup();
    setup();
    render(<WorldPersonaTemplateSection title="Fiche par défaut" worldId="w1" reviewEnabled />);
    // L'interrupteur de la fiche, dans l'en-tête de la page, éteint.
    expect(await screen.findByText("Cette fonction est désactivée.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Fiche par défaut" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("Voir ses réglages"));
    const validation = screen.getByRole("switch", { name: "Validation des fiches" });
    expect(validation).toBeDisabled();
    // Éteinte : sans fiche, la validation ne s'applique pas, même réglée en base.
    expect(validation).toHaveAttribute("aria-checked", "false");
    // Rien à éditer sans fiche.
    expect(screen.queryByRole("button", { name: "Éditer la fiche" })).toBeNull();
  });

  it("la tuile de la fiche désactivée la crée", async () => {
    vi.mocked(getWorldPersonaTemplate).mockResolvedValue({ ok: true, templateId: null });
    vi.mocked(setWorldPersonaTemplate).mockResolvedValue({ ok: true, templateId: "tpl2" });
    const user = userEvent.setup();
    setup();
    render(<WorldPersonaTemplateSection title="Fiche par défaut" worldId="w1" />);
    await user.click(await screen.findByRole("button", { name: "Activer" }));
    expect(setWorldPersonaTemplate).toHaveBeenCalledWith("w1", true);
    expect(await screen.findByRole("button", { name: "Éditer la fiche" })).toBeEnabled();
  });
});
