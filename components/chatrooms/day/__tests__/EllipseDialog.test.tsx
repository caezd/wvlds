import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

import { EllipseDialog } from "@/components/chatrooms/day/EllipseDialog";
import { ChatroomTimeProvider } from "@/components/chatrooms/day/chatroomTime";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: null,
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 4,
  current_month: 1,
};

function renderDialog(onPost = vi.fn(), time?: Parameters<typeof ChatroomTimeProvider>[0]["value"]) {
  render(
    <ChatroomTimeProvider
      value={time ?? {
        config: CONFIG,
        startDate: { year: 4, month: 1, day: 10 },
        currentDate: { year: 4, month: 1, day: 12 },
        day: { icon: "moon-star", position: 95, fromIcon: null, fromPosition: null, skipped: 0 },
      }}
    >
      <EllipseDialog open onOpenChange={() => {}} onPost={onPost} />
    </ChatroomTimeProvider>,
  );
  return { onPost, dialog: screen.getByRole("dialog", { name: "Ellipse" }) };
}

describe("EllipseDialog", () => {
  it("part du temps actuel du salon", () => {
    const { dialog } = renderDialog();
    expect(within(dialog).getByRole("radio", { name: "Nuit claire" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("slider", { name: "Moment de la journée" })).toHaveValue("95");
    expect(within(dialog).getByRole("slider", { name: "Moment de la journée" })).toHaveAttribute("aria-valuetext", "Nuit");
  });

  it("poste la météo, le moment et les jours passés choisis, et dit où en sera la date", async () => {
    const user = userEvent.setup();
    const { onPost, dialog } = renderDialog();

    await user.click(within(dialog).getByRole("radio", { name: "Pluie" }));
    fireEvent.change(within(dialog).getByRole("slider", { name: "Moment de la journée" }), { target: { value: "48" } });
    const jours = within(dialog).getByRole("spinbutton", { name: "Jours passés" });
    await user.clear(jours);
    await user.type(jours, "3");

    expect(dialog).toHaveTextContent("Le salon passe du 12 Dégel, an 4 au 15 Dégel, an 4.");
    // L'aperçu montre le saut : la position d'avant, puis trois pointillés.
    const apercu = within(dialog).getByRole("group", { name: "Temps du salon" });
    expect(within(apercu).getAllByTestId("day-dash")).toHaveLength(3);
    expect(within(apercu).getByText("Midi")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Poster l’ellipse" }));
    expect(onPost).toHaveBeenCalledWith({ days: 3, icon: "cloud-rain", position: 48 });
  });

  it("sans date ni temps de départ : l'aube, et pas d'indication de date", () => {
    const { dialog } = renderDialog(vi.fn(), { config: null, startDate: null, currentDate: null, day: null });
    expect(within(dialog).getByRole("radio", { name: "Lever du soleil" })).toHaveAttribute("aria-checked", "true");
    expect(dialog).not.toHaveTextContent("Le salon passe");
  });
});
