import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ avatar_builder: false }),
}));
vi.mock("@/lib/imageUtils", () => ({ toWebP: vi.fn(async (file: File) => file) }));
// Contourne le recadrage réel (canvas non disponible sous jsdom) : confirme
// immédiatement avec un blob factice au clic, comme si l'utilisateur avait
// choisi une image et validé le recadrage.
vi.mock("@/components/ui/image-crop-picker", () => ({
  ImagePickerCropField: ({ onConfirm }: { onConfirm: (blob: Blob) => void | Promise<void> }) => (
    <button type="button" onClick={() => onConfirm(new Blob(["x"], { type: "image/jpeg" }))}>
      confirmer (mock)
    </button>
  ),
}));

import { PersonaEditorContent } from "@/components/personas/PersonaEditSheet";

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  refresh.mockClear();
});

describe("PersonaEditorContent — rafraîchissement après changement de bannière", () => {
  // Régression : sans router.refresh() après l'enregistrement, fermer puis
  // rouvrir la sheet remonte PersonaEditorContent avec le initialBannerUrl
  // resté périmé (le composant parent n'a jamais refetch les données
  // serveur) — la bannière fraîchement changée disparaît. L'avatar fait déjà
  // ce refresh ; la bannière ne le faisait pas.
  it("appelle router.refresh() après l'enregistrement d'une bannière, comme pour l'avatar", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(
      <PersonaEditorContent personaId="p1" personaName="Kael" sections={[]} onSectionsChange={vi.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: "Ajouter une bannière" }));
    await user.click(await screen.findByRole("button", { name: "confirmer (mock)" }));

    // La bannière est bien passée en état "définie" localement...
    await screen.findByRole("button", { name: "Modifier la bannière" });
    // ...et le refresh serveur a bien été demandé (sinon un remount ultérieur
    // afficherait l'ancien initialBannerUrl).
    expect(refresh).toHaveBeenCalled();
  });

  it("appelle router.refresh() après la suppression d'une bannière", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(
      <PersonaEditorContent
        personaId="p1"
        personaName="Kael"
        sections={[]}
        onSectionsChange={vi.fn()}
        initialBannerUrl="https://x/banner.png"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Modifier la bannière" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer la bannière" }));
    // Confirmation dans le AlertDialog — bouton "Supprimer" (confirmLabel par
    // défaut), distinct du texte "Supprimer la bannière" du déclencheur.
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    await screen.findByRole("button", { name: "Ajouter une bannière" });
    expect(refresh).toHaveBeenCalled();
  });
});
