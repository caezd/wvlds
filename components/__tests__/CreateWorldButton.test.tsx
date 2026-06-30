import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { CreateWorldButton } from "@/components/worlds/CreateWorldButton";
import { createClient } from "@/lib/supabase/client";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockReturnValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("CreateWorldButton", () => {
  it("crée un monde et navigue vers sa page", async () => {
    const user = userEvent.setup();
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { id: "w99" }, error: null }],
    });
    use(mock);

    render(<CreateWorldButton />);
    await user.click(screen.getByRole("button", { name: /nouveau monde/i }));
    await user.type(screen.getByLabelText(/nom du monde/i), "Avalonia");
    await user.click(screen.getByRole("button", { name: /^créer$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/w99"));
    expect(mock.buildersFor("worlds")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "u1", name: "Avalonia", visibility: "private" }),
    );
  });

  it("n'insère rien si le nom est vide (validation HTML required)", async () => {
    const user = userEvent.setup();
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);

    render(<CreateWorldButton />);
    await user.click(screen.getByRole("button", { name: /nouveau monde/i }));
    await user.click(screen.getByRole("button", { name: /^créer$/i }));

    expect(mock.from).not.toHaveBeenCalledWith("worlds");
    expect(push).not.toHaveBeenCalled();
  });

  it("affiche un message de quota au lieu du formulaire si quota atteint", async () => {
    const user = userEvent.setup();
    use(createSupabaseMock({ user: { id: "u1" } }));

    render(<CreateWorldButton quotaReached />);
    await user.click(screen.getByRole("button", { name: /nouveau monde/i }));

    expect(screen.getByText(/quota gratuit est atteint/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nom du monde/i)).not.toBeInTheDocument();
  });
});
