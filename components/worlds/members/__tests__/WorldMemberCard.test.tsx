import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline", onlineUsers: {} }),
  useUserPresence: () => "offline",
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }), rpc: async () => ({ data: null }) }) }));

import { WorldMemberCard, type WorldMemberCardData } from "@/components/worlds/members/WorldMemberCard";

const NOW = new Date(2026, 8, 19, 12, 0, 0);

function member(over: Partial<WorldMemberCardData> = {}): WorldMemberCardData {
  return {
    user_id: "u1",
    isOwner: false,
    username: "alice",
    avatar_url: null,
    roles: [],
    personas: [],
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

describe("WorldMemberCard", () => {
  it("un membre actif : ni badge, ni lignes vides", () => {
    render(<WorldMemberCard member={member()} presence="offline" now={NOW} />);
    const card = screen.getByRole("article");
    expect(card.dataset.status).toBe("active");
    expect(card.querySelector("[data-status='paused'], [data-status='away']")).toBeNull();
    expect(card.querySelector("dl")).toBeNull();
    expect(screen.queryByTestId("member-activity")).toBeNull();
  });

  it("en pause jusqu'à une date : le badge le dit, la carte se grise, le mot est au survol", () => {
    render(
      <WorldMemberCard
        member={member({ status: "paused", status_until: "2026-10-15", status_note: "examens", effectiveStatus: "paused" })}
        presence="offline"
        now={NOW}
      />,
    );
    const badge = screen.getByText(/En pause jusqu'au 15 oct/);
    expect(badge.closest("[data-status='paused']")).toHaveAttribute("title", "examens");
    expect(screen.getByRole("article").className).toContain("bg-muted/20");
  });

  it("l'activité, à droite du nom : le nombre de messages et la dernière prise de parole, en icônes", () => {
    render(
      <WorldMemberCard
        member={member()}
        presence="offline"
        now={NOW}
        activity={{ message_count: 412, last_message_at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() }}
      />,
    );
    const activity = screen.getByTestId("member-activity");
    const values = Array.from(activity.querySelectorAll("dd")).map((dd) => dd.textContent);
    // Le chiffre seul, puis la date relative — sans les mots « messages » ni « actif ».
    expect(values).toEqual(["412", "il y a 3 jours"]);
    // Le détail reste au survol.
    expect(activity.querySelector("[title*='actif il y a 3 jours']")).not.toBeNull();
  });

  it("disponibilités et heure locale sur la même ligne", () => {
    render(
      <WorldMemberCard member={member({ availability: "Le soir en semaine", timezone: "Asia/Tokyo" })} presence="offline" now={NOW} />,
    );
    // 12:00 UTC+2 (Paris) en septembre → l'instant absolu vaut 10:00 UTC → 19:00 à Tokyo ;
    // `now` est construit en heure locale de la machine, on ne teste que la forme.
    expect(screen.getByText(/Le soir en semaine · \d{2}:\d{2} heure locale/)).toBeInTheDocument();
  });

  it("annonce un anniversaire dans la fenêtre, le tait au-delà", () => {
    const { unmount } = render(
      <WorldMemberCard member={member({ birthday_month: 10, birthday_day: 12 })} presence="offline" now={NOW} />,
    );
    expect(screen.getByText(/Anniversaire le 12 oct/)).toBeInTheDocument();
    unmount();

    render(<WorldMemberCard member={member({ birthday_month: 3, birthday_day: 1 })} presence="offline" now={NOW} />);
    expect(screen.queryByText(/Anniversaire/)).toBeNull();
  });

  it("le jour même : « Anniversaire aujourd'hui ! »", () => {
    render(<WorldMemberCard member={member({ birthday_month: 9, birthday_day: 19 })} presence="offline" now={NOW} />);
    expect(screen.getByText("Anniversaire aujourd'hui !")).toBeInTheDocument();
  });

  it("au-delà de quatre personas, une pastille « +N » dans la rangée, le libellé au survol", () => {
    const personas = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Perso ${i}`, avatar_url: null, narrative_status: "alive" as const }));
    render(<WorldMemberCard member={member({ personas })} presence="offline" now={NOW} />);
    const chip = screen.getByText("+3");
    expect(chip).toHaveAttribute("title", expect.stringContaining("3"));
    expect(screen.queryByText("Perso 4")).toBeNull();
  });

  it("la présentation est tronquée à deux lignes", () => {
    render(<WorldMemberCard member={member({ bio: "Rôliste depuis 2004." })} presence="offline" now={NOW} />);
    expect(screen.getByText("Rôliste depuis 2004.").className).toContain("line-clamp-2");
  });
});
