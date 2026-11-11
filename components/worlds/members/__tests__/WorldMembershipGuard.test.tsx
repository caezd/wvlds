import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

import { WorldMembershipGuard } from "../WorldMembershipGuard";
import { emitMembershipChange } from "@/lib/membershipEvents";

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
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
