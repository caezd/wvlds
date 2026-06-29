import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import {
  useCurrentUser,
  CurrentUserProvider,
  type InitialUser,
} from "@/components/providers/CurrentUserProvider";
import { createClient } from "@/lib/supabase/client";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockReturnValue(mock.client as never);

const wrapper = (initialUser: InitialUser) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <CurrentUserProvider initialUser={initialUser}>{children}</CurrentUserProvider>;
  };

/** Récupère le callback passé à onAuthStateChange pour simuler les événements. */
const authCallback = (mock: ReturnType<typeof createSupabaseMock>) =>
  (mock.onAuthStateChange.mock.calls[0] as unknown[])[0] as (
    event: string,
    session: unknown,
  ) => void;

beforeEach(() => vi.clearAllMocks());

describe("useCurrentUser", () => {
  it("expose l'identité fournie par le serveur sans aucune requête réseau au boot", () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: wrapper({ id: "u1", username: "alice" }),
    });

    expect(result.current.userId).toBe("u1");
    expect(result.current.username).toBe("alice");
    expect(result.current.loading).toBe(false);
    // Le gain de l'optimisation : pas de getUser() ni de select username au démarrage.
    expect(mock.client.auth.getUser).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("réagit à une connexion et récupère le username manquant", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { username: "bob" } }],
    });
    use(mock);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: wrapper(null) });
    expect(result.current.loading).toBe(true);

    act(() => authCallback(mock)("SIGNED_IN", { user: { id: "u1" } }));

    await waitFor(() => expect(result.current.userId).toBe("u1"));
    await waitFor(() => expect(result.current.username).toBe("bob"));
    expect(result.current.loading).toBe(false);
  });

  it("ne refait pas de requête profiles quand le username vient du serveur", () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: wrapper({ id: "u1", username: "alice" }),
    });

    act(() => authCallback(mock)("INITIAL_SESSION", { user: { id: "u1" } }));

    expect(result.current.username).toBe("alice");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("repasse à des valeurs nulles à la déconnexion", () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: wrapper({ id: "u1", username: "alice" }),
    });

    act(() => authCallback(mock)("SIGNED_OUT", null));

    expect(result.current.user).toBeNull();
    expect(result.current.userId).toBeNull();
    expect(result.current.username).toBeNull();
  });

  it("se désabonne du listener d'auth au démontage", () => {
    const unsubscribe = vi.fn();
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    use(mock);

    const { unmount } = renderHook(() => useCurrentUser(), { wrapper: wrapper(null) });
    expect(mock.onAuthStateChange).toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("renvoie des valeurs neutres hors provider", () => {
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.userId).toBeNull();
    expect(result.current.username).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
