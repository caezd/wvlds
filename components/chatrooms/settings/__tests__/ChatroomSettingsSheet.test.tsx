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
// Le champ des invités a ses propres tests : ici, un double qui invite d'un clic.
vi.mock("@/components/chatrooms/access/ChatroomInviteesField", () => ({
  ChatroomInviteesField: (props: {
    label: string;
    value: { kind: string; id: string }[];
    onChange: (v: { kind: string; id: string }[]) => void;
  }) => (
    <div data-testid="invitees">
      <span>{props.label}</span>
      <span data-testid="invitee-count">{props.value.length}</span>
      <button type="button" onClick={() => props.onChange([...props.value, { kind: "group", id: "g-new" }])}>
        inviter (double)
      </button>
    </div>
  ),
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

/**
 * `results` : les réponses après la lecture des invités, qui part la première
 * à l'ouverture (migration 225) ; `invitees` en est la réponse.
 */
function setup(
  results: { data: unknown; error: unknown }[] = [],
  invitees: { persona_id: string | null; group_id: string | null }[] = [],
) {
  const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: invitees, error: null }, ...results] });
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

  it("téléverse l'icône sous un nom neuf, et ne l'enregistre qu'avec « Enregistrer »", async () => {
    const mock = setup([{ data: [{ id: "c1" }], error: null }]); // update chatrooms
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    await user.click(screen.getByText("Choisir une image"));

    await waitFor(() => {
      expect(mock.storageUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^chatroom-c1\/icon-\d+\.webp$/),
        expect.anything(),
        expect.anything(),
      );
    });
    // Envoyée, mais pas encore enregistrée.
    expect(mock.buildersFor("chatrooms")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      const builders = mock.buildersFor("chatrooms");
      expect(builders).toHaveLength(1);
      expect(builders[0].update).toHaveBeenCalledWith({ icon_url: expect.stringMatching(/chatroom-c1\/icon-\d+\.webp$/) });
    });
  });

  it("téléverse sans consulter la session au préalable", async () => {
    // Sous Firefox, `auth.getUser()` attend le verrou de session de
    // supabase-js (navigator.locks) qu'un autre onglet peut retenir : l'envoi
    // qui le précédait ne partait alors jamais. Le jeton du client suffit —
    // le bucket refuse de lui-même un appelant sans droit.
    const mock = setup([{ data: null, error: null }]);
    mock.client.auth.getUser.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    await user.click(screen.getByText("Choisir une image"));

    await waitFor(() => expect(mock.storageUpload).toHaveBeenCalledTimes(1));
    expect(mock.client.auth.getUser).not.toHaveBeenCalled();
  });
});

describe("ChatroomSettingsSheet — rien ne part avant « Enregistrer », puis tout en une requête", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("le bouton reste en bas, grisé tant que rien n'a changé", () => {
    setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("modifier le nom n'écrit rien ; « Enregistrer » l'écrit et le confirme", async () => {
    const mock = setup([{ data: [{ id: "c1" }], error: null }]);
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    const input = screen.getByPlaceholderText("Nom de la salle…");
    await user.clear(input);
    await user.type(input, "Nouveau nom");
    await user.tab();
    expect(mock.buildersFor("chatrooms")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => {
      expect(mock.buildersFor("chatrooms")[0]?.update).toHaveBeenCalledWith({ title: "Nouveau nom" });
    });
    expect(toast.success).toHaveBeenCalledWith("Modification enregistrée.");
  });

  it("nom et catégorie modifiés partent dans la MÊME requête", async () => {
    const mock = setup([
      { data: [{ id: "cat1", title: "Aventures", banner_url: null, icon_url: null }], error: null }, // fetch catégories
      { data: [{ id: "c1" }], error: null }, // update unique
    ]);
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} worldId="w1" open hideTrigger />);

    await user.click(await screen.findByText("Aventures"));
    const input = screen.getByPlaceholderText("Nom de la salle…");
    await user.clear(input);
    await user.type(input, "Nouveau nom");
    expect(mock.buildersFor("chatrooms")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatrooms")[0].update).toHaveBeenCalledWith({ title: "Nouveau nom", category_id: "cat1" });
  });

  it("un refus (erreur, ou aucune ligne touchée) ne confirme rien", async () => {
    setup([{ data: [], error: null }]); // RLS : aucune ligne, sans erreur
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    const input = screen.getByPlaceholderText("Nom de la salle…");
    await user.clear(input);
    await user.type(input, "Nouveau nom");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("L'enregistrement a échoué"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("ChatroomSettingsSheet — synopsis et accès (migration 225)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("le synopsis part avec les autres réglages, en une requête", async () => {
    const mock = setup([
      { data: [], error: null }, // catégories
      { data: [{ id: "c1" }], error: null }, // update
    ]);
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={{ ...CHATROOM, synopsis: null }} worldId="w1" open hideTrigger />);

    await user.type(screen.getByLabelText("Synopsis"), "  Une nuit d'orage. ");
    await user.click(screen.getByRole("radio", { name: /Public/ }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatrooms")[0].update).toHaveBeenCalledWith({
      synopsis: "Une nuit d'orage.",
      visibility: "public",
    });
  });

  it("les invités enregistrés se relisent à l'ouverture, et seul l'écart part", async () => {
    const mock = setup(
      [
        { data: [], error: null }, // catégories
        { data: null, error: null }, // ajout d'invités
      ],
      [{ persona_id: "p1", group_id: null }],
    );
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={{ ...CHATROOM, visibility: "private" }} worldId="w1" open hideTrigger />);

    expect(await screen.findByText("Qui peut entrer")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("invitee-count")).toHaveTextContent("1"));
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "inviter (double)" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Modification enregistrée."));
    // Rien à écrire dans le salon lui-même : seuls les invités changent.
    expect(mock.buildersFor("chatrooms")).toHaveLength(0);
    const [lecture, ajout] = mock.buildersFor("chatroom_participants");
    expect(lecture.eq).toHaveBeenCalledWith("chatroom_id", "c1");
    expect(ajout.insert).toHaveBeenCalledWith([{ chatroom_id: "c1", persona_id: null, group_id: "g-new" }]);
  });

  it("un salon ouvert ne montre pas d'invités", async () => {
    setup([{ data: [], error: null }]);
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} worldId="w1" open hideTrigger />);
    expect(screen.getByRole("radio", { name: /Ouvert/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("invitees")).toBeNull();
  });
});

describe("ChatroomSettingsSheet — temps du salon (migration 275)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("activé puis réglé, le temps part par la base avec « Enregistrer », sans toucher au salon", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    const interrupteur = screen.getByRole("switch", { name: "Régler le temps du salon" });
    expect(interrupteur).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "Pluie" })).toBeNull();

    await user.click(interrupteur);
    await user.click(screen.getByRole("radio", { name: "Pluie" }));
    expect(mock.rpc).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("set_chatroom_day", { p_chat: "c1", p_icon: "cloud-rain", p_position: 10 }),
    );
    expect(mock.buildersFor("chatrooms")).toHaveLength(0);
    expect(toast.success).toHaveBeenCalledWith("Modification enregistrée.");
  });

  it("désactivé, le temps est effacé", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(
      <ChatroomSettingsSheet canEdit chatroom={{ ...CHATROOM, day: { icon: "sun", position: 40 } }} open hideTrigger />,
    );

    const interrupteur = screen.getByRole("switch", { name: "Régler le temps du salon" });
    expect(interrupteur).toBeChecked();
    expect(screen.getByRole("radio", { name: "Soleil" })).toHaveAttribute("aria-checked", "true");

    await user.click(interrupteur);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("set_chatroom_day", { p_chat: "c1", p_icon: null, p_position: null }),
    );
  });

  it("un refus de la base ne confirme rien", async () => {
    const mock = setup();
    mock.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
    const user = userEvent.setup();
    render(<ChatroomSettingsSheet canEdit chatroom={CHATROOM} open hideTrigger />);

    await user.click(screen.getByRole("switch", { name: "Régler le temps du salon" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Le temps du salon n’a pas pu être enregistré."));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
