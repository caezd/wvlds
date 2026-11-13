import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline", onlineUsers: {} }),
  useUserPresence: () => "offline",
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }), rpc: async () => ({ data: null }) }) }));

import { PlayerShelfHeader } from "@/components/worlds/community/PlayerShelf";
import type { WorldMemberCardData } from "@/components/worlds/members/WorldMemberCard";

const NOW = new Date(2026, 8, 19, 12, 0, 0);

function member(over: Partial<WorldMemberCardData> = {}): WorldMemberCardData {
  return {
    user_id: "u1",
    isOwner: false,
    username: "alice",
    avatar_url: null,
    roles: [],
    status: "active",
    status_until: null,
    status_note: null,
    bio: null,
    availability: null,
    timezone: null,
    birthday_month: null,
    birthday_day: null,
    effectiveStatus: "active",
    ...over,
  };
}

const ROLE = {
  id: "r1", world_id: "w1", name: "MJ", color: "#ef4444", lucide_icon: null,
  position: 10, permissions: [], is_default: false, mentionable: false, hoist: true,
};

/** La ligne de résumé, sous le nom. */
function summaryLine() {
  return screen.getByRole("heading").parentElement!.nextElementSibling!;
}

describe("PlayerShelfHeader", () => {
  it("un membre actif : pseudo, présence dans la pastille seule, ni ligne vide, ni badge, ni rôle", () => {
    const { container } = render(<PlayerShelfHeader member={member()} presence="offline" now={NOW} />);
    expect(screen.getByRole("heading", { name: "@alice" })).toBeInTheDocument();
    // Le mot n'est dit qu'aux lecteurs d'écran (et au survol de la pastille).
    expect(screen.getByText("Hors ligne").className).toContain("sr-only");
    expect(screen.getByRole("heading").parentElement!.nextElementSibling).toBeNull();
    expect(container.querySelector("[data-status='paused'], [data-status='away']")).toBeNull();
    expect(screen.queryByRole("list", { name: "Rôles" })).toBeNull();
  });

  it("en pause jusqu'à une date : le badge le dit, le mot est au survol", () => {
    render(
      <PlayerShelfHeader
        member={member({ status: "paused", status_until: "2026-10-15", status_note: "examens", effectiveStatus: "paused" })}
        presence="offline"
        now={NOW}
      />,
    );
    const badge = screen.getByText(/En pause jusqu'au 15 oct/).closest("[data-status='paused']")!;
    expect(badge).toHaveAttribute("title", "examens");
    // Le badge commun, au ton de l'avertissement.
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-tone", "warning");
  });

  it("les rôles en puces neutres sur la ligne de résumé, la couleur réduite à une pastille ; le propriétaire en tête", () => {
    render(<PlayerShelfHeader member={member({ isOwner: true, roles: [ROLE] })} presence="online" now={NOW} />);
    const list = screen.getByRole("list", { name: "Rôles" });
    expect(summaryLine()).toContainElement(list);
    const chips = list.querySelectorAll("li");
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(["Propriétaire", "MJ"]);
    const badge = chips[1].querySelector("[data-slot='badge']")!;
    expect(badge).toHaveAttribute("data-tone", "neutral");
    expect(badge.getAttribute("style")).toBeNull();
    // La couleur du rôle ne teinte que la pastille.
    expect(badge.querySelector("[aria-hidden]")).toHaveStyle({ backgroundColor: "#ef4444" });
  });

  it("une seule ligne : dernière activité, heure locale, anniversaire — pas le nombre de messages", () => {
    render(
      <PlayerShelfHeader
        member={member({ timezone: "Asia/Tokyo", birthday_month: 10, birthday_day: 12, bio: "Rôliste depuis 2004." })}
        presence="online"
        now={NOW}
        activity={{ message_count: 412, last_message_at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() }}
      />,
    );
    expect(summaryLine()).toHaveTextContent(
      /^actif il y a 3 jours · \d{2}:\d{2} heure locale · Anniversaire le 12 oct\.$/,
    );
    // La présentation reste dans le profil.
    expect(screen.queryByText("Rôliste depuis 2004.")).toBeNull();
  });

  it("l'anniversaire lointain est tu ; le jour même, il est annoncé", () => {
    const { unmount } = render(<PlayerShelfHeader member={member({ birthday_month: 3, birthday_day: 1 })} presence="offline" now={NOW} />);
    expect(screen.queryByText(/Anniversaire/)).toBeNull();
    unmount();

    render(<PlayerShelfHeader member={member({ birthday_month: 9, birthday_day: 19 })} presence="offline" now={NOW} />);
    expect(summaryLine()).toHaveTextContent("Anniversaire aujourd'hui !");
  });

  it("les actions à droite du nom", () => {
    render(<PlayerShelfHeader member={member()} presence="offline" now={NOW} actions={<button type="button">Profil</button>} />);
    expect(screen.getByRole("button", { name: "Profil" })).toBeInTheDocument();
  });
});
