import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { avatarThumbWidth, supabaseThumb } from "@/lib/storage";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ avatar_builder: false }),
}));
vi.mock("@/lib/imageUtils", () => ({ toWebP: vi.fn(async (file: File) => file) }));
vi.mock("@/components/ui/image-crop-picker", () => ({
  ImagePickerCropField: () => <div />,
}));

import { PersonaEditorContent } from "@/components/personas/PersonaEditSheet";

const AVATAR = "https://x.supabase.co/storage/v1/object/public/personas/avatars/p1.webp";

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("PersonaEditorContent — qualité de l'avatar", () => {
  // Régression : l'édition passait l'URL brute à next/image avec un `sizes`
  // en px fixe, pendant que l'aperçu demandait une vignette imgproxy via
  // AvatarWithFrame. Deux encodeurs, deux qualités (75 contre 80) : la même
  // image s'affichait visiblement différemment entre les deux vues.
  it("demande exactement la même image que l'aperçu", () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
      <PersonaEditorContent
        personaId="p1"
        personaName="Kael"
        sections={[]}
        onSectionsChange={vi.fn()}
        initialAvatarUrl={AVATAR}
      />,
    );

    const src = [...document.querySelectorAll("img")]
      .map((img) => decodeURIComponent(img.getAttribute("src") ?? ""))
      .find((s) => s.includes("/avatars/"));

    // `AvatarWithFrame` (utilisé par l'aperçu et la fiche publique) demande
    // le palier correspondant à sa taille : l'édition doit demander la même
    // chose, pas seulement « quelque chose d'assez grand ».
    expect(src).toBe(supabaseThumb(AVATAR, avatarThumbWidth(128)));
  });
});
