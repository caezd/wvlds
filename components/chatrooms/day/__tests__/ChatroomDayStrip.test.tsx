import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatroomDayStrip } from "@/components/chatrooms/day/ChatroomDayStrip";

describe("ChatroomDayStrip", () => {
  it("nomme le moment de la journée sous l'icône, à sa place sur la ligne", () => {
    render(<ChatroomDayStrip day={{ icon: "sunrise", position: 5, fromIcon: null, fromPosition: null, skipped: 0 }} />);
    const ligne = screen.getByRole("group", { name: "Temps du salon" });
    expect(within(ligne).getByText("Aube")).toBeVisible();
    expect(within(ligne).getByTestId("day-icon")).toHaveStyle({ left: "5%" });
    expect(within(ligne).getByTestId("day-icon")).toHaveAttribute("aria-label", "Lever du soleil");
    expect(within(ligne).queryAllByTestId("day-dash")).toHaveLength(0);
    expect(within(ligne).queryByTestId("day-from")).toBeNull();
  });

  it("après une ellipse, la position d'avant puis un pointillé par jour passé", () => {
    render(<ChatroomDayStrip day={{ icon: "cloud-rain", position: 48, fromIcon: "moon-star", fromPosition: 95, skipped: 3 }} />);
    const ligne = screen.getByRole("group", { name: "Temps du salon" });
    expect(within(ligne).getByTestId("day-from")).toHaveAttribute("aria-label", "Nuit claire");
    expect(within(ligne).getAllByTestId("day-dash")).toHaveLength(3);
    expect(within(ligne).queryByTestId("day-overflow")).toBeNull();
    expect(within(ligne).getByText("Midi")).toBeVisible();
    expect(ligne).toHaveTextContent("3 jours plus tard");
  });

  it("au-delà de sept jours, sept pointillés puis « ··· »", () => {
    render(<ChatroomDayStrip day={{ icon: "cloud-snow", position: 80, fromIcon: "cloud-rain", fromPosition: 48, skipped: 12 }} />);
    const ligne = screen.getByRole("group", { name: "Temps du salon" });
    expect(within(ligne).getAllByTestId("day-dash")).toHaveLength(7);
    expect(within(ligne).getByTestId("day-overflow")).toBeInTheDocument();
    expect(ligne).toHaveTextContent("12 jours plus tard");
    expect(within(ligne).getByText("Crépuscule")).toBeVisible();
  });

  it("le lendemain, au singulier", () => {
    render(<ChatroomDayStrip day={{ icon: "sun", position: 40, fromIcon: "sun", fromPosition: 40, skipped: 1 }} />);
    expect(screen.getByRole("group", { name: "Temps du salon" })).toHaveTextContent("le lendemain");
  });

  it("au survol du saut, une infobulle dit le nombre de jours", async () => {
    const user = userEvent.setup();
    render(<ChatroomDayStrip day={{ icon: "cloud-snow", position: 80, fromIcon: "cloud-rain", fromPosition: 48, skipped: 12 }} />);
    await user.hover(screen.getByTestId("day-overflow"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("12 jours plus tard");
  });
});
