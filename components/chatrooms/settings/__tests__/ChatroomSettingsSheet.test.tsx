import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ world_map: false }),
}));
vi.mock("@/lib/imageUtils", () => ({
  toWebP: vi.fn(async (file: File) => file),
}));

// Stub minimal : un bouton qui simule la confirmation d'un recadrage, sans
// dépendre de canvas/Image (non fiables sous jsdom) ni du flux réel de
// sélection de fichier — seul le câblage onConfirm → upload est testé ici.
vi.mock("@/components/ui/image-crop-picker", () => ({
  ImagePickerCropField: ({ onConfirm, changeLabel }: { onConfirm: (b: Blob) => void; changeLabel?: string }) => (
    <button type="button" onClick={() => onConfirm(new Blob(["x"], { type: "image/jpeg" }))}>
      {changeLabel ?? "Choisir une image"}
    </button>
  ),
}));

import ChatroomSettingsSheet from "@/components/chatrooms/settings/ChatroomSettingsSheet";

const CHATROOM = {
  id: "c1",
  title: "Salle de test",
  banner_url: null,
  icon_url: null,
};

function setup(results: { data: unknown; error: unknown }[] = []) {
  const mock = createSupabaseMock({ user: { id: "u1" }, results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

describe("ChatroomSettingsSheet — accès sans condition de nombre de messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le déclencheur des paramètres quand canEdit est vrai, même sans message", () => {
    setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} />);
    expect(screen.getByLabelText("Paramètres")).toBeInTheDocument();
  });

  it("masque le déclencheur quand canEdit est faux", () => {
    setup();
    render(<ChatroomSettingsSheet canEdit={false} chatroom={CHATROOM} />);
    expect(screen.queryByLabelText("Paramètres")).not.toBeInTheDocument();
  });
});

describe("ChatroomSettingsSheet — icône via le sélecteur avec recadrage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("téléverse et enregistre l'icône confirmée depuis ImagePickerCropField", async () => {
    const mock = setup([{ data: null, error: null }]); // update chatrooms.icon_url
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    await user.click(screen.getByText("Choisir une image"));

    await waitFor(() => {
      expect(mock.client.storage.from().upload).toHaveBeenCalledWith(
        "chatroom-c1/icon.webp",
        expect.anything(),
        expect.objectContaining({ upsert: true }),
      );
    });
    await waitFor(() => {
      const builders = mock.buildersFor("chatrooms");
      expect(builders.at(-1)?.update).toHaveBeenCalledWith({ icon_url: expect.stringContaining("chatroom-c1/icon.webp") });
    });
  });
});

describe("ChatroomSettingsSheet — confirmation par toast des modifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirme l'enregistrement du nom par un toast", async () => {
    const mock = setup([{ data: null, error: null }]); // update title
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    const input = screen.getByPlaceholderText("Nom de la salle…");
    await user.clear(input);
    await user.type(input, "Nouveau nom");
    await user.tab(); // blur

    await waitFor(() => {
      const builders = mock.buildersFor("chatrooms");
      expect(builders.at(-1)?.update).toHaveBeenCalledWith({ title: "Nouveau nom" });
    });
    expect(toast.success).toHaveBeenCalledWith("Modification enregistrée.");
  });

  it("confirme l'enregistrement de la catégorie par un toast", async () => {
    const mock = setup([
      { data: [{ id: "cat1", title: "Aventures", banner_url: null, icon_url: null }], error: null }, // fetch catégories
      { data: null, error: null }, // update category_id
    ]);
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} worldId="w1" open hideTrigger />);

    await user.click(await screen.findByText("Aventures"));

    await waitFor(() => {
      const builders = mock.buildersFor("chatrooms");
      expect(builders.at(-1)?.update).toHaveBeenCalledWith({ category_id: "cat1" });
    });
    expect(toast.success).toHaveBeenCalledWith("Modification enregistrée.");
  });

  it("n'affiche pas de toast de succès si l'enregistrement échoue", async () => {
    setup([{ data: null, error: { message: "boom" } }]); // update title en erreur
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    const input = screen.getByPlaceholderText("Nom de la salle…");
    await user.clear(input);
    await user.type(input, "Nouveau nom");
    await user.tab();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
