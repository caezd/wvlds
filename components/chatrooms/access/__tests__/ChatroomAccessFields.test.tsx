import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatroomInvitee, ChatroomVisibility } from "@/lib/chatroomAccess";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { ChatroomInviteesField } from "@/components/chatrooms/access/ChatroomInviteesField";
import { ChatroomVisibilityField } from "@/components/chatrooms/access/ChatroomVisibilityField";
import { ChatroomReadOnlyNotice, ChatroomSynopsis } from "@/components/chatrooms/access/ChatroomSynopsis";

const PERSONAS = [
  { id: "p-ada", name: "Ada", avatar_url: null },
  { id: "p-eloise", name: "Éloïse", avatar_url: null },
];
const GROUPS = [{ id: "g-garde", name: "La Garde", color: "#336699" }];

function setup() {
  // Les personas, puis les groupes.
  const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: PERSONAS }, { data: GROUPS }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function Invitees({ initial = [], onChange }: { initial?: ChatroomInvitee[]; onChange?: (v: ChatroomInvitee[]) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ChatroomInviteesField
      worldId="w1"
      label="Qui peut entrer"
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ChatroomInviteesField", () => {
  it("liste les groupes et les personas du monde, sans modèles ni supprimés", async () => {
    const mock = setup();
    render(<Invitees />);
    expect(await screen.findByRole("button", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "La Garde" })).toBeInTheDocument();

    const personas = mock.buildersFor("personas")[0];
    expect(personas.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(personas.is).toHaveBeenCalledWith("deleted_at", null);
    expect(personas.not).toHaveBeenCalledWith("is_template", "is", true);
    expect(mock.buildersFor("world_persona_groups")[0].eq).toHaveBeenCalledWith("world_id", "w1");
  });

  it("la recherche ignore accents et casse", async () => {
    setup();
    const user = userEvent.setup();
    render(<Invitees />);
    await screen.findByRole("button", { name: "Ada" });
    await user.type(screen.getByRole("textbox"), "elo");
    expect(screen.getByRole("button", { name: "Éloïse" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ada" })).toBeNull();
    expect(screen.queryByRole("button", { name: "La Garde" })).toBeNull();

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "zzz");
    expect(screen.getByText("Aucun résultat.")).toBeInTheDocument();
  });

  it("un clic invite, un second retire ; un groupe s'invite comme un persona", async () => {
    setup();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Invitees onChange={onChange} />);
    await user.click(await screen.findByRole("button", { name: "Ada" }));
    expect(screen.getByRole("button", { name: "Ada" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "La Garde" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "persona", id: "p-ada" },
      { kind: "group", id: "g-garde" },
    ]);

    const choisis = screen.getByRole("list", { name: "Invités" });
    expect(within(choisis).getByText("Ada")).toBeInTheDocument();
    expect(within(choisis).getByText("La Garde")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ada" }));
    expect(onChange).toHaveBeenLastCalledWith([{ kind: "group", id: "g-garde" }]);
  });

  it("la croix d'une puce retire l'invité", async () => {
    setup();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Invitees initial={[{ kind: "persona", id: "p-eloise" }]} onChange={onChange} />);
    await user.click(await screen.findByRole("button", { name: "Retirer Éloïse" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole("list", { name: "Invités" })).toBeNull();
  });
});

describe("ChatroomSynopsis", () => {
  it("rien pour un salon ouvert sans synopsis", () => {
    const { container } = render(<ChatroomSynopsis synopsis="  " visibility="open" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("le synopsis, et la visibilité d'un salon qui n'est pas ouvert", () => {
    render(<ChatroomSynopsis synopsis={"Une nuit d'orage.\nLa porte claque."} visibility="private" />);
    const section = screen.getByRole("region", { name: "Synopsis" });
    expect(within(section).getByRole("heading", { name: "Synopsis" })).toBeInTheDocument();
    expect(section).toHaveTextContent("Une nuit d'orage.");
    expect(within(section).getByText("Privé")).toBeInTheDocument();
  });

  it("sans synopsis, un salon public dit qui y écrit", () => {
    render(<ChatroomSynopsis synopsis={null} visibility="public" />);
    const section = screen.getByRole("region", { name: "Synopsis" });
    expect(within(section).queryByRole("heading")).toBeNull();
    expect(section).toHaveTextContent("Tout le monde lit, seuls les invités écrivent.");
  });

  it("l'avis de lecture seule", () => {
    render(<ChatroomReadOnlyNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("seuls ses invités y écrivent");
  });
});

describe("ChatroomVisibilityField", () => {
  function Visibility() {
    const [v, setV] = useState<ChatroomVisibility>("open");
    return <ChatroomVisibilityField value={v} onChange={setV} />;
  }

  it("trois choix, un seul coché", async () => {
    const user = userEvent.setup();
    render(<Visibility />);
    const group = screen.getByRole("radiogroup", { name: "Visibilité" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(radios[1]).toHaveTextContent("Tout le monde lit, seuls les invités écrivent.");

    await user.click(within(group).getByRole("radio", { name: /Privé/ }));
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    // Pas d'aria-pressed en plus d'aria-checked.
    expect(radios[2]).not.toHaveAttribute("aria-pressed");
  });
});
