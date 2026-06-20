import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockReturnValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("useCurrentUser", () => {
  it("expose l'utilisateur et son username, puis loading=false", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ data: { username: "alice" } }] }));
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBe("u1");
    await waitFor(() => expect(result.current.username).toBe("alice"));
  });

  it("renvoie des valeurs nulles quand personne n'est connecté", async () => {
    use(createSupabaseMock({ user: null }));
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.userId).toBeNull();
    expect(result.current.username).toBeNull();
  });

  it("se désabonne du listener d'auth au démontage", async () => {
    const unsubscribe = vi.fn();
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: { username: "x" } }] });
    mock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    use(mock);

    const { unmount } = renderHook(() => useCurrentUser());
    await waitFor(() => expect(mock.onAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
