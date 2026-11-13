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
// L'id de l'auteur vient du contexte, pas de `auth.getUser()` : cet appel
// attend le verrou de session de supabase-js, qu'un autre onglet peut retenir
// sous Firefox — l'envoi n'en partait alors jamais.
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1" }),
}));
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

describe("PersonaEditorContent — la bannière passe par le brouillon", () => {
  // La fiche n'écrit plus au fil de l'eau : l'image part au stockage — un
  // fichier ne s'attend pas dans la mémoire du navigateur — et son URL va au
  // brouillon, que le bouton « Enregistrer » écrira.
  it("envoyer une bannière ne touche pas à la fiche, mais la porte au brouillon", async () => {
    const mock = createSupabaseMock();
    // La session est tenue par un autre onglet : `getUser()` ne rend jamais
    // la main, et l'envoi doit partir quand même.
    mock.client.auth.getUser.mockReturnValue(new Promise(() => {}));
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const onPatch = vi.fn();
    const user = userEvent.setup();

    render(
      <PersonaEditorContent personaId="p1" personaName="Kael" sections={[]} onSectionsChange={vi.fn()} onPatch={onPatch} />,
    );

    await user.click(await screen.findByRole("button", { name: "Ajouter une bannière" }));
    await user.click(await screen.findByRole("button", { name: "confirmer (mock)" }));

    // La bannière est passée en état « définie » localement…
    await screen.findByRole("button", { name: "Modifier la bannière" });
    // …et l'URL attend dans le brouillon, sans écriture sur la fiche.
    const [patch, files] = onPatch.mock.calls.at(-1)!;
    expect(patch.banner_url).toContain("banners/p1.webp");
    expect(files.uploaded).toBe(patch.banner_url);
    expect(mock.buildersFor("personas")).toHaveLength(0);
    // Rangée sous le préfixe de son auteur, exigé par la policy du bucket.
    expect(mock.storageUpload.mock.calls[0][0]).toMatch(/^user-u1\//);
    expect(mock.client.auth.getUser).not.toHaveBeenCalled();
  });

  it("retirer la bannière la vide dans le brouillon, sans effacer le fichier", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const onPatch = vi.fn();
    const user = userEvent.setup();

    render(
      <PersonaEditorContent
        personaId="p1"
        personaName="Kael"
        sections={[]}
        onSectionsChange={vi.fn()}
        onPatch={onPatch}
        initialBannerUrl="https://x/storage/v1/object/public/personas/user-u1/banners/p1.webp"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Modifier la bannière" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer la bannière" }));
    // Confirmation dans le AlertDialog — bouton "Supprimer" (confirmLabel par
    // défaut), distinct du texte "Supprimer la bannière" du déclencheur.
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    await screen.findByRole("button", { name: "Ajouter une bannière" });
    const [patch, files] = onPatch.mock.calls.at(-1)!;
    expect(patch).toEqual({ banner_url: null });
    // Le fichier n'est effacé qu'une fois la fiche enregistrée sans lui.
    expect(files.orphan).toContain("banners/p1.webp");
    expect(mock.buildersFor("personas")).toHaveLength(0);
  });
});
