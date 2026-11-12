import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/hooks/useReconnectEpoch", () => ({ useReconnectEpoch: () => 0 }));
const verification = vi.hoisted(() => ({ resultat: true as boolean | null }));
vi.mock("@/lib/membershipCheck", () => ({
  isStillWorldMember: vi.fn(async () => verification.resultat),
}));

import { WorldMembershipGuard } from "../WorldMembershipGuard";
import { emitMembershipChange } from "@/lib/membershipEvents";

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
  verification.resultat = true;
});

describe("WorldMembershipGuard", () => {
  it("renvoie hors du monde quand on en est retiré", () => {
    render(<WorldMembershipGuard worldId="w1" selfId="u1" />);
    act(() => emitMembershipChange({ worldId: "w1", change: "removed" }));
    expect(replace).toHaveBeenCalledWith("/p");
  });

  it("ignore le retrait d'un autre monde et les adhésions", () => {
    render(<WorldMembershipGuard worldId="w1" selfId="u1" />);
    act(() => {
      emitMembershipChange({ worldId: "w2", change: "removed" });
      emitMembershipChange({ worldId: "w1", change: "added" });
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("n'écoute plus rien une fois démonté", () => {
    const { unmount } = render(<WorldMembershipGuard worldId="w1" selfId="u1" />);
    unmount();
    act(() => emitMembershipChange({ worldId: "w1", change: "removed" }));
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("WorldMembershipGuard — vérification au montage (page servie par le cache)", () => {
  it("renvoie hors du monde si l'on n'en est plus membre", async () => {
    verification.resultat = false;
    render(<WorldMembershipGuard worldId="w1" selfId="u1" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/p"));
  });

  it("ne renvoie personne sur une réponse incertaine (coupure)", async () => {
    verification.resultat = null;
    render(<WorldMembershipGuard worldId="w1" selfId="u1" />);
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
  });

  it("ne renvoie qu'une fois même si l'avis arrive aussi", async () => {
    verification.resultat = false;
    render(<WorldMembershipGuard worldId="w1" selfId="u1" />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    act(() => emitMembershipChange({ worldId: "w1", change: "removed" }));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
