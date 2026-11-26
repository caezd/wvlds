import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/client";
import { useMyBirthDate } from "@/hooks/useMyBirthDate";

function setup(data: unknown, error: unknown = null) {
  const mock = createSupabaseMock({ results: [{ data, error }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("useMyBirthDate (migration 266)", () => {
  it("lit la date enregistrée du compte : majeur", async () => {
    const mock = setup({ birth_date: "1990-06-15" });
    const { result } = renderHook(() => useMyBirthDate());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current).toEqual({ status: "adult", birthDate: "1990-06-15" }));
    expect(mock.from).toHaveBeenCalledWith("profile_birth_dates");
  });

  it("mineur", async () => {
    const year = new Date().getFullYear() - 10;
    setup({ birth_date: `${year}-01-01` });
    const { result } = renderHook(() => useMyBirthDate());
    await waitFor(() => expect(result.current.status).toBe("minor"));
  });

  it("sans date enregistrée, ou en cas d'erreur : inconnu", async () => {
    setup(null);
    const { result } = renderHook(() => useMyBirthDate());
    await waitFor(() => expect(result.current).toEqual({ status: "unknown", birthDate: null }));

    setup(null, { message: "boom" });
    const { result: r2 } = renderHook(() => useMyBirthDate());
    await waitFor(() => expect(r2.current.status).toBe("unknown"));
  });

  it("désactivé : ne lit rien", () => {
    const mock = setup({ birth_date: "1990-06-15" });
    const { result } = renderHook(() => useMyBirthDate({ enabled: false }));
    expect(result.current.status).toBe("loading");
    expect(mock.from).not.toHaveBeenCalled();
  });
});
