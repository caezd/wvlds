import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const route = vi.hoisted(() => ({ pathname: "/explore" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

import { useMyWorldCard } from "@/hooks/useMyWorldCard";

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "33333333-3333-4333-8333-333333333333";
const card = (bio: string, name: string) => ({
  user_id: "me", status: "active", status_until: null, status_note: null, bio,
  availability: null, timezone: null, birthday_month: null, birthday_day: null, world: { name },
});

beforeEach(() => {
  vi.clearAllMocks();
  route.pathname = `/w/${W1}`;
});

describe("useMyWorldCard", () => {
  it("renvoie le même objet tant que la carte ne change pas ; patch la met à jour", async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock({ results: [{ data: card("Avant", "Un") }] }).client as never);
    const { result, rerender } = renderHook(() => useMyWorldCard("me"));
    await waitFor(() => expect(result.current?.card.bio).toBe("Avant"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    act(() => first!.patch({ bio: "Après" }));
    expect(result.current?.card.bio).toBe("Après");
    expect(result.current?.worldName).toBe("Un");
  });

  it("une écriture qui aboutit après un changement de monde n'écrase pas la carte du nouveau monde", async () => {
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock({ results: [{ data: card("Carte un", "Un") }, { data: card("Carte deux", "Deux") }] }).client as never,
    );
    const { result, rerender } = renderHook(() => useMyWorldCard("me"));
    await waitFor(() => expect(result.current?.worldId).toBe(W1));
    const patchW1 = result.current!.patch;

    route.pathname = `/w/${W2}`;
    rerender();
    await waitFor(() => expect(result.current?.worldId).toBe(W2));

    act(() => patchW1({ bio: "Écrite dans le monde un" }));
    expect(result.current?.worldId).toBe(W2);
    expect(result.current?.card.bio).toBe("Carte deux");
  });

  it("une erreur de lecture est signalée dans la console", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createClient).mockReturnValue(createSupabaseMock({ results: [{ data: null, error: { message: "boom" } }] }).client as never);
    const { result } = renderHook(() => useMyWorldCard("me"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("[useMyWorldCard] lecture de la carte", { message: "boom" }));
    expect(result.current).toBeNull();
    spy.mockRestore();
  });
});
