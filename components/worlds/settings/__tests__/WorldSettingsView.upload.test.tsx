import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { World } from "@/types/worlds";

// ──────────────────────────────────────────────────────────────────────────
// L'icône et la bannière d'un monde partent directement du navigateur vers le
// bucket `worlds`, sous le préfixe `user-{id}/…` qu'exige sa policy. L'id
// venait de `auth.getUser()` : sous Firefox, cet appel attend le verrou de
// session de supabase-js (navigator.locks) qu'un autre onglet peut retenir,
// et l'envoi ne partait alors jamais. Il vient désormais du contexte.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false }),
}));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({
  WorldPersonaTemplateSection: () => <div data-testid="persona-template-stub" />,
}));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({
  WorldCategoryManager: () => <div data-testid="category-manager-stub" />,
}));
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAgeRestricted: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAvatarType: vi.fn().mockResolvedValue({ ok: true }),
  getWorldTags: vi.fn().mockResolvedValue({ ok: true, tags: [] }),
  addWorldTag: vi.fn().mockResolvedValue({ ok: true, tag: "" }),
  removeWorldTag: vi.fn().mockResolvedValue({ ok: true }),
}));
// browser-image-compression s'appuie sur un Web Worker, indisponible sous
// jsdom : la conversion est éprouvée ailleurs.
vi.mock("@/lib/imageUtils", () => ({ toWebP: vi.fn(async (file: File) => file) }));
// Contourne le recadrage réel (canvas non disponible sous jsdom) : confirme
// avec un blob factice au clic, comme si l'utilisateur avait validé.
vi.mock("@/components/ui/image-crop-picker", () => ({
  ImagePickerCropField: ({ onConfirm }: { onConfirm: (blob: Blob) => void | Promise<void> }) => (
    <button type="button" onClick={() => onConfirm(new Blob(["x"], { type: "image/png" }))}>
      confirmer (mock)
    </button>
  ),
}));
const moi = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: moi.userId }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const BASE_WORLD: World = {
  id: "w1",
  name: "Veldis",
  description: "",
  icon_url: null,
  banner_url: null,
  color: null,
  visibility: "private",
  enable_inventory: true,
  enable_skills: true,
  enable_faceclaims: true,
  restrict_inventory: false,
  restrict_skills: false,
  timeline_enabled: false,
  timeline_config: null,
  allows_real_avatars: false,
  allows_illustrated_avatars: false,
  is_age_restricted: false,
  wiki_label: null,
};

function setup() {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  // La session est tenue par un autre onglet : `getUser()` ne rend jamais la
  // main. Rien ici ne doit l'attendre.
  mock.client.auth.getUser.mockReturnValue(new Promise(() => {}));
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

describe("WorldSettingsView — envoi de l'icône et de la bannière", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moi.userId = "u1";
  });

  it("range l'image sous le préfixe de son auteur, pris dans le contexte", async () => {
    const mock = setup();
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    render(<WorldSettingsView world={BASE_WORLD} onUpdated={onUpdated} />);

    // Le premier sélecteur est celui de l'icône.
    await user.click(screen.getAllByRole("button", { name: "confirmer (mock)" })[0]);

    await waitFor(() => expect(mock.storageUpload).toHaveBeenCalledTimes(1));
    expect(mock.storageUpload.mock.calls[0][0]).toMatch(/^user-u1\/world-w1\/icon-\d+\.webp$/);
    expect(mock.client.auth.getUser).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Image enregistrée."));
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "w1", icon_url: expect.stringContaining("user-u1/world-w1/icon-") }),
    );
  });

  it("signale la session expirée sans rien envoyer quand le contexte n'a pas d'utilisateur", async () => {
    moi.userId = null;
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={BASE_WORLD} />);

    await user.click(screen.getAllByRole("button", { name: "confirmer (mock)" })[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Session expirée"));
    expect(mock.storageUpload).not.toHaveBeenCalled();
  });

  it("n'affiche pas le message brut du stockage quand l'envoi échoue", async () => {
    // Ce texte nomme la table et la policy refusée : un libellé traduit à la
    // place, et le détail dans la console.
    const mock = setup();
    mock.storageUpload.mockResolvedValueOnce({
      data: null,
      error: new Error("new row violates row-level security policy"),
    });
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<WorldSettingsView world={BASE_WORLD} />);

    await user.click(screen.getAllByRole("button", { name: "confirmer (mock)" })[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Envoi impossible. Réessayez dans un instant."));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("row-level security"));
    erreurConsole.mockRestore();
  });
});
