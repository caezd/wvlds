import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { WorldBirthdaysWidget, upcomingBirthdays } from "@/components/worlds/home/widgets/WorldBirthdaysWidget";

const NOW = new Date(2026, 8, 19);
const members = [
  { user_id: "u1", username: "zoe", avatar_url: null, birthday_month: 10, birthday_day: 12 },
  { user_id: "u2", username: "alice", avatar_url: null, birthday_month: 9, birthday_day: 19 },
  { user_id: "u3", username: "bob", avatar_url: null, birthday_month: 3, birthday_day: 1 },
  { user_id: "u4", username: "carl", avatar_url: null, birthday_month: 10, birthday_day: 12 },
];

describe("upcomingBirthdays", () => {
  it("garde la fenêtre, aujourd'hui d'abord, puis par date puis par nom", () => {
    const list = upcomingBirthdays(members, 30, NOW);
    expect(list.map((m) => m.username)).toEqual(["alice", "carl", "zoe"]);
    expect(list[0].inDays).toBe(0);
  });
});

describe("WorldBirthdaysWidget", () => {
  it("liste les anniversaires à venir avec la date, « Aujourd'hui ! » le jour même", () => {
    render(<WorldBirthdaysWidget worldId="w1" days={30} initialMembers={members} now={NOW} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("@alice");
    expect(items[0]).toHaveTextContent("Aujourd'hui !");
    expect(items[1]).toHaveTextContent(/12 oct/);
    expect(screen.queryByText("@bob")).toBeNull();
  });

  it("dit qu'il n'y en a aucun dans la fenêtre", () => {
    render(<WorldBirthdaysWidget worldId="w1" days={7} initialMembers={[members[0], members[2]]} now={NOW} />);
    expect(screen.getByText("Aucun anniversaire dans les 7 prochains jours.")).toBeInTheDocument();
  });
});
