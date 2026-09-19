import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";
import type { PersonaSectionWithFields } from "@/types/personas";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "me", username: "moi", plan: "free" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Le monde relit ses fiches (migration 184) — sauf quand un test le coupe.
const review = vi.hoisted(() => ({ active: true as boolean | null }));
vi.mock("@/hooks/useWorldReviewActive", () => ({ useWorldReviewActive: () => review.active }));

import { PersonaSubmitBar, PersonaReviewSection } from "@/components/personas/PersonaReviewPanel";
import { PersonaSheetBadge } from "@/components/personas/PersonaSheetBadge";

const TEMPLATE_SECTIONS = [{ id: "ts1", persona_id: "t", name: "Identité", position: 0 }];
const TEMPLATE_FIELDS = [
  { id: "tf-title", section_id: "ts1", type: "title", position: 0, data: { text: "Biographie" }, locked: true, required: false },
  { id: "tf-bio", section_id: "ts1", type: "text", position: 1, data: { text: "" }, locked: true, required: true },
];

function sheet(text: string, linked = true): PersonaSectionWithFields[] {
  return [{
    id: "s1", persona_id: "p1", name: "Identité", position: 0,
    fields: [{ id: "f-bio", section_id: "s1", type: "text", position: 0, data: { text }, template_field_id: linked ? "tf-bio" : null }],
  }];
}

/**
 * Ordre des `.from()` de PersonaSubmitBar : personas (le modèle) puis, dans le
 * même tick, persona_review_comments (dernier renvoi, en brouillon seulement),
 * puis persona_sections et persona_section_fields du modèle.
 */
function setupSubmit(lastComment: unknown = null, extra: { data: unknown }[] = []) {
  const mock = createSupabaseMock({
    results: [
      { data: { id: "t" } },
      { data: lastComment },
      { data: TEMPLATE_SECTIONS },
      { data: TEMPLATE_FIELDS },
      ...extra,
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); review.active = true; });

describe("PersonaSheetBadge", () => {
  it("ne rend rien pour une fiche validée et complète, sauf demande explicite", () => {
    const { container, rerender } = render(<PersonaSheetBadge persona={{ review_status: "approved", sheet_complete: true }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PersonaSheetBadge persona={{ review_status: "approved", sheet_complete: true }} showApproved />);
    expect(screen.getByText("Validée").closest("[data-sheet-status]")).toHaveAttribute("data-sheet-status", "approved");
  });

  it("« incomplète » l'emporte sur l'état de relecture", () => {
    render(<PersonaSheetBadge persona={{ review_status: "submitted", sheet_complete: false }} />);
    expect(screen.getByText("Fiche incomplète").closest("[data-sheet-status]")).toHaveAttribute("data-sheet-status", "incomplete");
  });

  it("sans relecture dans le monde, l'état de relecture ne s'affiche pas", () => {
    const { container, rerender } = render(<PersonaSheetBadge persona={{ review_status: "draft", sheet_complete: true }} reviewActive={false} showApproved />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PersonaSheetBadge persona={{ review_status: "draft", sheet_complete: false }} reviewActive={false} />);
    expect(screen.getByText("Fiche incomplète")).toBeInTheDocument();
  });
});

describe("PersonaSubmitBar", () => {
  it("liste le champ vide, désactive l'envoi, puis soumet une fois la fiche remplie", async () => {
    const mock = setupSubmit();
    const user = userEvent.setup();
    const { rerender } = render(
      <PersonaSubmitBar personaId="p1" worldId="w1" sections={sheet("")} initialReviewStatus="draft" />,
    );

    await screen.findByTestId("missing-fields");
    expect(screen.getByText("Identité · Biographie")).toBeInTheDocument();
    expect(screen.getByText("à remplir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Soumettre à validation" })).toBeDisabled();
    expect(screen.getByText("Fiche incomplète")).toBeInTheDocument();

    rerender(<PersonaSubmitBar personaId="p1" worldId="w1" sections={sheet("Née à Lyon")} initialReviewStatus="draft" />);
    expect(screen.queryByTestId("missing-fields")).toBeNull();
    const submit = screen.getByRole("button", { name: "Soumettre à validation" });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(mock.client.rpc).toHaveBeenCalledWith("submit_persona_for_review", { p_persona_id: "p1" });
    await waitFor(() => expect(screen.getByText("Votre fiche est en relecture. Vous pouvez continuer à la modifier.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Soumettre à validation" })).toBeNull();
  });

  it("un champ absent propose la synchronisation avec le modèle", async () => {
    const mock = setupSubmit(null, [{ data: [] }, { data: [] }]);
    mock.client.rpc.mockResolvedValue({ data: 1, error: null });
    const user = userEvent.setup();
    const onSectionsReload = vi.fn();
    render(
      <PersonaSubmitBar personaId="p1" worldId="w1" sections={sheet("", false)} initialReviewStatus="draft" onSectionsReload={onSectionsReload} />,
    );

    await screen.findByText("champ à ajouter");
    await user.click(screen.getByRole("button", { name: "Ajouter les champs manquants" }));
    expect(mock.client.rpc).toHaveBeenCalledWith("sync_persona_template_fields", { p_persona_id: "p1" });
    await waitFor(() => expect(onSectionsReload).toHaveBeenCalled());
  });

  it("renvoyée en brouillon : le dernier commentaire du relecteur en bandeau, et « Soumettre à nouveau »", async () => {
    setupSubmit({ body: "Trop court.", author: { username: "mj" } });
    render(<PersonaSubmitBar personaId="p1" worldId="w1" sections={sheet("ok")} initialReviewStatus="draft" />);
    await screen.findByText("Votre fiche a été renvoyée en brouillon.");
    expect(screen.getByText("@mj — Trop court.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Soumettre à nouveau" })).toBeEnabled();
  });

  it("sans relecture dans le monde : la liste de ce qui manque, mais ni statut ni bouton", async () => {
    review.active = false;
    // Sans relecture, le dernier renvoi n'est pas demandé : la file n'a pas ce cran.
    const mock = createSupabaseMock({ results: [{ data: { id: "t" } }, { data: TEMPLATE_SECTIONS }, { data: TEMPLATE_FIELDS }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { rerender } = render(<PersonaSubmitBar personaId="p1" worldId="w1" sections={sheet("")} initialReviewStatus="draft" />);
    await screen.findByTestId("missing-fields");
    expect(screen.queryByRole("button", { name: "Soumettre à validation" })).toBeNull();
    expect(screen.queryByText("Brouillon")).toBeNull();
    // Fiche complète : plus rien à dire du tout.
    rerender(<PersonaSubmitBar personaId="p1" worldId="w1" sections={sheet("Née à Lyon")} initialReviewStatus="draft" />);
    expect(screen.queryByTestId("missing-fields")).toBeNull();
    expect(screen.queryByText("Fiche incomplète")).toBeNull();
  });

  it("hors monde, rien à soumettre", () => {
    setupSubmit();
    const { container } = render(<PersonaSubmitBar personaId="p1" worldId={null} sections={[]} initialReviewStatus="draft" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PersonaReviewSection", () => {
  const COMMENTS = [
    { id: "c1", author_id: "mj", body: "Bien vu.", decision: "approved", created_at: new Date().toISOString(), author: { username: "mj" } },
    { id: "c2", author_id: "me", body: "Merci !", decision: null, created_at: new Date().toISOString(), author: { username: "moi" } },
  ];

  it("un relecteur valide une fiche soumise, avec son commentaire", async () => {
    const mock = createSupabaseMock({ results: [{ data: COMMENTS }, { data: COMMENTS }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <PersonaReviewSection personaId="p1" worldId="w1" ownerId="u1" reviewStatus="submitted" sheetComplete canReview onStatusChange={onStatusChange} />,
    );

    await screen.findByText("Bien vu.");
    expect(screen.getByText("a validé la fiche")).toBeInTheDocument();
    // Son propre commentaire se supprime, pas celui d'un autre.
    expect(screen.getAllByRole("button", { name: "Supprimer ce commentaire" })).toHaveLength(1);

    await user.type(screen.getByRole("textbox"), "Parfait.");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(mock.client.rpc).toHaveBeenCalledWith("review_persona", { p_persona_id: "p1", p_decision: "approved", p_comment: "Parfait." });
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith("approved"));
  });

  it("le propriétaire lit et commente, sans décider", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }, { data: null }, { data: [] }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    render(<PersonaReviewSection personaId="p1" worldId="w1" ownerId="me" reviewStatus="draft" sheetComplete canReview={false} />);

    await screen.findByText("Aucun commentaire pour le moment.");
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Renvoyer" })).toBeNull();

    await user.type(screen.getByRole("textbox"), "Je corrige.");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(mock.client.from).toHaveBeenCalledWith("persona_review_comments"));
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });
});
