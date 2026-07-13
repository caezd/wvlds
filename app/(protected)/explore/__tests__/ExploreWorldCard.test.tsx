import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const joinPublicWorld = vi.fn();
vi.mock("../actions", () => ({ joinPublicWorld: (...args: unknown[]) => joinPublicWorld(...args) }));

import { ExploreWorldCard } from "../ExploreWorldCard";
import { createClient } from "@/lib/supabase/client";

const world = {
  id: "w1",
  name: "Avalonia",
  description: "Un monde de fantasy",
  banner_url: null,
  icon_url: null,
  color: "#123456",
  allows_real_avatars: false,
  allows_illustrated_avatars: false,
  is_age_restricted: false,
};

const ageRestrictedWorld = { ...world, id: "w2", is_age_restricted: true };

function setup(rpcResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const mock = createSupabaseMock({ user: { id: "u1" } });
  mock.rpc.mockResolvedValue(rpcResult);
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("ExploreWorldCard", () => {
  it("n'ouvre pas le dialog de stats par défaut et ne charge rien", () => {
    const mock = setup();
    render(<ExploreWorldCard world={world} tags={["fantasy"]} />);

    expect(screen.queryByRole("button", { name: /rejoindre/i })).not.toBeInTheDocument();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("charge les stats en une seule requête RPC au clic sur la carte", async () => {
    const mock = setup({
      data: { message_count: 343, member_count: 13, persona_count: 44 },
      error: null,
    });
    const user = userEvent.setup();
    render(<ExploreWorldCard world={world} tags={["fantasy"]} />);

    await user.click(screen.getByRole("button", { name: /avalonia/i }));

    await waitFor(() => expect(screen.getByText("343")).toBeInTheDocument());
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("get_world_public_stats", { p_world_id: "w1" });
  });

  it("ne refait pas de requête si le dialog est refermé puis rouvert", async () => {
    const mock = setup({
      data: { message_count: 5, member_count: 2, persona_count: 1 },
      error: null,
    });
    const user = userEvent.setup();
    render(<ExploreWorldCard world={world} tags={[]} />);

    const trigger = screen.getByRole("button", { name: /avalonia/i });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());

    await user.keyboard("{Escape}");
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());

    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("permet de rejoindre le monde depuis le dialog puis navigue vers /w/:id", async () => {
    setup({ data: { message_count: 0, member_count: 0, persona_count: 0 }, error: null });
    joinPublicWorld.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ExploreWorldCard world={world} tags={[]} />);

    await user.click(screen.getByRole("button", { name: /avalonia/i }));
    await user.click(await screen.findByRole("button", { name: /rejoindre/i }));

    await waitFor(() => expect(joinPublicWorld).toHaveBeenCalledWith("w1", false));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/w1"));
  });

  it("monde 18+ : demande confirmation avant de rejoindre", async () => {
    setup({ data: { message_count: 0, member_count: 0, persona_count: 0 }, error: null });
    joinPublicWorld.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ExploreWorldCard world={ageRestrictedWorld} tags={[]} />);

    await user.click(screen.getByRole("button", { name: /avalonia/i }));
    await user.click(await screen.findByRole("button", { name: /rejoindre/i }));

    // La confirmation d'âge s'affiche, join_public_world n'est pas encore appelé.
    expect(await screen.findByText(/confirmation d.âge requise/i)).toBeInTheDocument();
    expect(joinPublicWorld).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /j'ai 18 ans ou plus/i }));

    await waitFor(() => expect(joinPublicWorld).toHaveBeenCalledWith("w2", true));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/w2"));
  });
});
