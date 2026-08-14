import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { WorldStatsWidget } from "@/components/worlds/home/widgets/WorldStatsWidget";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldStatsWidget", () => {
  it("affiche les compteurs renvoyés par la RPC", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({
      data: { message_count: 42, member_count: 5, persona_count: 12 },
      error: null,
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(<WorldStatsWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(mock.rpc).toHaveBeenCalledWith("get_world_public_stats", { p_world_id: "w1" });
  });

  it("affiche 0 partout si la RPC ne renvoie rien", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: null, error: null });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(<WorldStatsWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getAllByText("0")).toHaveLength(3);
    });
  });
});
