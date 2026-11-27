import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { WorldTimelineConfig } from "@/types/worlds";
import type { ChatroomEllipse } from "@/lib/chatroomDay";

import { EllipseMessageView } from "@/components/chatrooms/day/EllipseMessageView";
import { ChatroomTimeProvider } from "@/components/chatrooms/day/chatroomTime";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: null,
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 4,
  current_month: 1,
};

const ELLIPSE: ChatroomEllipse = {
  id: "e1",
  days: 3,
  from_icon: "moon-star",
  from_position: 95,
  to_icon: "cloud-rain",
  to_position: 48,
  from_date: { year: 4, month: 1, day: 12 },
  to_date: { year: 4, month: 1, day: 15 },
};

function renderView(ellipse: ChatroomEllipse | null, config: WorldTimelineConfig | null = CONFIG) {
  render(
    <ChatroomTimeProvider value={{ config, startDate: null, currentDate: null, day: null }}>
      <EllipseMessageView ellipse={ellipse} mine onDelete={vi.fn()} />
    </ChatroomTimeProvider>,
  );
}

describe("EllipseMessageView", () => {
  it("une ligne seule, lue en base : les jours passés et la date atteinte la décrivent", () => {
    renderView(ELLIPSE);
    const bloc = screen.getByRole("article", { name: "Ellipse" });
    expect(bloc).toHaveAccessibleDescription("3 jours plus tard · 15 Dégel, an 4");
    // La date atteinte s'affiche au-dessus de la ligne.
    const date = within(bloc).getByText("15 Dégel, an 4", { selector: "p" });
    expect(date.compareDocumentPosition(within(bloc).getByRole("group", { name: "Temps du salon" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const ligne = within(bloc).getByRole("group", { name: "Temps du salon" });
    expect(within(ligne).getByTestId("day-from")).toHaveAttribute("aria-label", "Nuit claire");
    expect(within(ligne).getAllByTestId("day-dash")).toHaveLength(3);
    expect(within(ligne).getByTestId("day-icon")).toHaveAttribute("aria-label", "Pluie");
  });

  it("sans chronologie, pas de date", () => {
    renderView(ELLIPSE, null);
    expect(screen.getByRole("article", { name: "Ellipse" })).toHaveAccessibleDescription("3 jours plus tard");
  });

  it("une ellipse le même jour : pas de pointillé", () => {
    renderView({ ...ELLIPSE, days: 0, from_icon: "sun", from_position: 40, from_date: null, to_date: null });
    const bloc = screen.getByRole("article", { name: "Ellipse" });
    expect(bloc).toHaveAccessibleDescription("le même jour");
    expect(within(bloc).queryAllByTestId("day-dash")).toHaveLength(0);
  });

  it("sans sa ligne en base, l'ellipse se nomme sans rien inventer", () => {
    renderView(null);
    const bloc = screen.getByRole("article", { name: "Ellipse" });
    expect(within(bloc).queryByRole("group", { name: "Temps du salon" })).toBeNull();
  });
});
