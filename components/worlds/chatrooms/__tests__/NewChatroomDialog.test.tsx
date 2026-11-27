import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock, type QueryResult } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { WorldTimelineConfig } from "@/types/worlds";
import type { ChatroomInvitee } from "@/lib/chatroomAccess";

const push = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => ({ world_map: false }) }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));
const addCreatedWorldRoom = vi.hoisted(() => vi.fn());
vi.mock("@/lib/worldRoomsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worldRoomsStore")>()),
  addCreatedWorldRoom,
}));

// Le champ des invités a ses propres tests : ici, un double qui invite un
// persona d'un clic et montre son intitulé.
vi.mock("@/components/chatrooms/access/ChatroomInviteesField", () => ({
  ChatroomInviteesField: (props: { label: string; value: ChatroomInvitee[]; onChange: (v: ChatroomInvitee[]) => void }) => (
    <div data-testid="invitees">
      <span>{props.label}</span>
      <button type="button" onClick={() => props.onChange([...props.value, { kind: "persona", id: "p-b" }])}>
        inviter (double)
      </button>
    </div>
  ),
}));

import { NewChatroomDialog } from "@/components/worlds/chatrooms/NewChatroomDialog";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: null,
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 4,
  current_month: 1,
};

const LINKABLE = [
  { id: "vieux", title: "Un vieux salon", timeline_date: { year: 1, month: 0, day: 1 }, mine: false, last_at: "2026-01-01T00:00:00Z" },
  { id: "recent", title: "Mon salon récent", timeline_date: { year: 3, month: null, day: null }, mine: true, last_at: "2026-09-01T00:00:00Z" },
  { id: "futur", title: "Un salon à venir", timeline_date: { year: 9, month: 0, day: 1 }, mine: true, last_at: "2026-09-10T00:00:00Z" },
];

/** Les catégories au montage, puis le salon créé, puis ce qui suit (invités, suite). */
function setup(after: QueryResult[] = []) {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [{ data: [] }, { data: { id: "c-neuf" } }, ...after],
  });
  mock.rpc.mockResolvedValue({ data: LINKABLE, error: null });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function mockCoarsePointer(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(pointer: coarse)" ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/Nouveau jeu…/));
  return screen.findByRole("heading", { name: "Nouveau jeu" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCoarsePointer(false);
});

describe("NewChatroomDialog — conteneur", () => {
  it("un dialogue sur ordinateur", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="drawer-popup"]')).not.toBeInTheDocument();
  });

  it("un tiroir sur mobile", async () => {
    mockCoarsePointer(true);
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  });

  it("n'écrit plus de premier message : pas de composeur", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    expect(document.querySelector("[contenteditable]")).toBeNull();
    expect(screen.getByLabelText("Synopsis")).toBeInTheDocument();
  });
});

describe("NewChatroomDialog — création", () => {
  it("crée le salon vide, ouvert par défaut, puis y emmène", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);

    const titre = screen.getByLabelText("Titre");
    await user.clear(titre);
    await user.type(titre, "La taverne");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/c/c-neuf"));
    expect(mock.buildersFor("chatrooms")[0].insert).toHaveBeenCalledWith({
      world_id: "w1",
      title: "La taverne",
      created_by: "u1",
      visibility: "open",
      synopsis: null,
      timeline_date: null,
      map_pin_id: null,
      category_id: null,
    });
    expect(mock.buildersFor("chatroom_participants")).toHaveLength(0);
    expect(mock.buildersFor("chat_messages")).toHaveLength(0);
  });

  it("le salon créé rejoint aussitôt la barre latérale, parmi les récents", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);

    const titre = screen.getByLabelText("Titre");
    await user.clear(titre);
    await user.type(titre, "La taverne");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/c/c-neuf"));
    expect(addCreatedWorldRoom).toHaveBeenCalledWith("w1", { id: "c-neuf", title: "La taverne", category_id: null });
  });

  it("privé : le synopsis et les invités partent avec le salon", async () => {
    const mock = setup([{ data: null }]);
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);

    // Ouvert : personne à inviter.
    expect(screen.queryByTestId("invitees")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Privé/ }));
    expect(screen.getByRole("radio", { name: /Privé/ })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByTestId("invitees")).getByText("Qui peut entrer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "inviter (double)" }));
    await user.type(screen.getByLabelText("Synopsis"), "  Une nuit d'orage.  ");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/c/c-neuf"));
    expect(mock.buildersFor("chatrooms")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private", synopsis: "Une nuit d'orage." }),
    );
    expect(mock.buildersFor("chatroom_participants")[0].insert).toHaveBeenCalledWith([
      { chatroom_id: "c-neuf", persona_id: "p-b", group_id: null },
    ]);
  });

  it("public : les invités sont ceux qui écrivent", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    await user.click(screen.getByRole("radio", { name: /Public/ }));
    expect(within(screen.getByTestId("invitees")).getByText("Qui peut écrire")).toBeInTheDocument();
  });

  it("revenu à « Ouvert », les invités choisis ne sont pas enregistrés", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    await user.click(screen.getByRole("radio", { name: /Privé/ }));
    await user.click(screen.getByRole("button", { name: "inviter (double)" }));
    await user.click(screen.getByRole("radio", { name: /Ouvert/ }));
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(mock.buildersFor("chatroom_participants")).toHaveLength(0);
  });

  it("des invités refusés n'empêchent pas le salon d'exister", async () => {
    setup([{ error: { message: "refus" } }]);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    await user.click(screen.getByRole("radio", { name: /Privé/ }));
    await user.click(screen.getByRole("button", { name: "inviter (double)" }));
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/c/c-neuf"));
    expect(toastError).toHaveBeenCalledWith(
      "Le salon est créé, mais pas ses invités : ajoutez-les depuis ses réglages.",
    );
    erreur.mockRestore();
  });

  it("un échec de création garde le formulaire ouvert", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: [] }, { error: { message: "refusé" } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("refusé"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Nouveau jeu" })).toBeInTheDocument();
  });
});

describe("NewChatroomDialog — titre", () => {
  it("effacer puis tirer au hasard, dans le champ", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);

    const titre = screen.getByLabelText("Titre");
    expect(titre).not.toHaveValue("");
    const champ = titre.parentElement!;
    await user.click(within(champ).getByRole("button", { name: "Effacer le titre" }));
    expect(titre).toHaveValue("");
    await user.click(within(champ).getByRole("button", { name: "Générer un titre aléatoire" }));
    expect(titre).not.toHaveValue("");
  });
});

describe("NewChatroomDialog — fermeture", () => {
  it("sans saisie, se ferme sans confirmation", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Nouveau jeu" })).toBeNull());
  });

  it("un synopsis entamé demande confirmation", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" />);
    await openForm(user);
    await user.type(screen.getByLabelText("Synopsis"), "Il pleut");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(await screen.findByText("Abandonner ce salon ?")).toBeInTheDocument();
  });
});

describe("NewChatroomDialog — « Jouer ici » depuis la carte", () => {
  it("s'ouvre de lui-même, situé sur le lieu demandé", async () => {
    const mock = setup();
    window.history.replaceState(null, "", "/w/w1?play=pin1");
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" initialMapPinId="pin1" />);

    expect(await screen.findByRole("heading", { name: "Nouveau jeu" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("play")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatrooms")[0].insert).toHaveBeenCalledWith(expect.objectContaining({ map_pin_id: "pin1" }));
  });

  it("reste fermé sans lieu demandé", () => {
    setup();
    render(<NewChatroomDialog worldId="w1" />);
    expect(screen.queryByRole("heading", { name: "Nouveau jeu" })).toBeNull();
  });
});

describe("NewChatroomDialog — chronologie", () => {
  it("sans chronologie, ni date ni « Suite de… »", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={null} />);
    await openForm(user);
    expect(screen.queryByText("Chronologie")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Suite de…" })).toBeNull();
  });

  it("facultative : la date s'active d'un interrupteur, sur la période en cours", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={CONFIG} />);
    await openForm(user);

    expect(screen.queryByRole("region", { name: "Date dans la chronologie" })).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Dater ce salon" }));
    const section = screen.getByRole("region", { name: "Date dans la chronologie" });
    expect(within(section).getByLabelText("Mois")).toHaveDisplayValue("Dégel");

    await user.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(mock.buildersFor("chatrooms")).toHaveLength(1));
    expect(mock.buildersFor("chatrooms")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ timeline_date: { year: 4, month: 1, day: null } }),
    );
  });

  it("exigée : la date est là d'emblée, sans interrupteur", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await openForm(user);
    expect(screen.getByRole("region", { name: "Date dans la chronologie" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Dater ce salon" })).toBeNull();
  });

  it("exigée et restreinte : la date est celle de la période en cours", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={{ ...CONFIG, require_date: true, restrict_to_current: true }} />);
    await openForm(user);
    const section = screen.getByRole("region", { name: "Date dans la chronologie" });
    expect(within(section).getByTestId("timeline-period-lock")).toHaveTextContent("Dégel, an 4");
  });

  it("« Suite de… » : les salons datés, ceux où l'on joue d'abord", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={CONFIG} />);
    await openForm(user);

    const suite = await screen.findByRole("combobox", { name: "Suite de…" });
    const groupes = suite.querySelectorAll("optgroup");
    expect([...groupes].map((g) => g.getAttribute("label"))).toEqual(["Où vous jouez", "Autres salons"]);
    expect(within(groupes[0] as HTMLElement).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Un salon à venir", "Mon salon récent",
    ]);
    expect(suite).toHaveValue("");
  });

  it("une fois le salon daté, pas de suite d'un salon situé après lui", async () => {
    setup();
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={{ ...CONFIG, require_date: true }} />);
    await openForm(user);
    const suite = await screen.findByRole("combobox", { name: "Suite de…" });
    expect(within(suite).queryByRole("option", { name: "Un salon à venir" })).toBeNull();
    expect(within(suite).getByRole("option", { name: "Mon salon récent" })).toBeInTheDocument();
  });

  it("le salon naît relié à celui qu'il suit ; proposé, on est prévenu", async () => {
    const mock = setup([{ data: { status: "pending" } }]);
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={CONFIG} />);
    await openForm(user);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Suite de…" }), "Un vieux salon");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(mock.buildersFor("chatroom_sequels")).toHaveLength(1));
    expect(mock.buildersFor("chatroom_sequels")[0].insert).toHaveBeenCalledWith({
      world_id: "w1", chatroom_id: "c-neuf", previous_id: "vieux",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(
      "Salon créé. La suite est proposée : les participants de l'autre salon doivent l'accepter.",
    ));
  });

  it("un lien refusé n'empêche pas le salon d'exister", async () => {
    const mock = setup([{ error: { message: "boucle" } }]);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<NewChatroomDialog worldId="w1" timelineConfig={CONFIG} />);
    await openForm(user);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Suite de…" }), "Mon salon récent");
    await user.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      "Le salon est créé, mais pas le lien de suite : refaites-le depuis ses réglages.",
    ));
    expect(mock.buildersFor("chatrooms")).toHaveLength(1);
    expect(push).toHaveBeenCalledWith("/c/c-neuf");
    erreur.mockRestore();
  });
});
