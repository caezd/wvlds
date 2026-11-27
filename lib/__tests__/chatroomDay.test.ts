import { describe, it, expect, vi } from "vitest";
import type { WorldTimelineConfig } from "@/types/worlds";
import {
  DAY_DASHES_MAX,
  DAY_WEATHER_ICONS,
  addTimelineDays,
  dayDashes,
  dayMoment,
  ellipseErrorKey,
  postEllipseForMessage,
} from "@/lib/chatroomDay";

const CONFIG: WorldTimelineConfig = {
  year_label: "an",
  era_name: null,
  month_names: ["Givre", "Dégel"],
  days_per_month: [30, 28],
  current_year: 4,
  current_month: 1,
};

// Mêmes cas que la vérification de `timeline_add_days` en base (migration 275).
describe("addTimelineDays", () => {
  it("avance dans le mois", () => {
    expect(addTimelineDays(CONFIG, { year: 4, month: 1, day: 12 }, 3)).toEqual({ year: 4, month: 1, day: 15 });
  });

  it("passe au mois suivant, et à l'année suivante après le dernier mois", () => {
    expect(addTimelineDays(CONFIG, { year: 4, month: 1, day: 27 }, 3)).toEqual({ year: 5, month: 0, day: 2 });
  });

  it("part du 1er du mois pour une date sans jour", () => {
    expect(addTimelineDays(CONFIG, { year: 4, month: 0, day: null }, 31)).toEqual({ year: 4, month: 1, day: 2 });
  });

  it("laisse une année seule, et une date sans jour passé, telles quelles", () => {
    expect(addTimelineDays(CONFIG, { year: 4, month: null, day: null }, 5)).toEqual({ year: 4, month: null, day: null });
    expect(addTimelineDays(CONFIG, { year: 4, month: 0, day: 1 }, 0)).toEqual({ year: 4, month: 0, day: 1 });
  });

  it("compte 30 jours pour un mois sans longueur enregistrée", () => {
    const sansLongueurs = { ...CONFIG, month_names: ["A", "B"], days_per_month: undefined };
    expect(addTimelineDays(sansLongueurs, { year: 4, month: 0, day: 1 }, 59)).toEqual({ year: 4, month: 1, day: 30 });
  });
});

describe("dayMoment", () => {
  it("nomme le moment de la journée d'après la position sur la ligne", () => {
    expect([0, 9, 10, 34, 35, 59, 60, 74, 75, 87, 88, 100].map(dayMoment)).toEqual([
      "dawn", "dawn", "morning", "morning", "noon", "noon", "afternoon", "afternoon", "dusk", "dusk", "night", "night",
    ]);
  });
});

describe("dayDashes", () => {
  it("un pointillé par jour passé, sept au plus, puis la suite", () => {
    expect(dayDashes(0)).toEqual({ dashes: 0, overflow: false });
    expect(dayDashes(3)).toEqual({ dashes: 3, overflow: false });
    expect(dayDashes(DAY_DASHES_MAX)).toEqual({ dashes: 7, overflow: false });
    expect(dayDashes(12)).toEqual({ dashes: 7, overflow: true });
  });
});

describe("icônes de météo", () => {
  it("des noms d'icônes que la base accepte", () => {
    for (const name of DAY_WEATHER_ICONS) expect(name).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(DAY_WEATHER_ICONS).size).toBe(DAY_WEATHER_ICONS.length);
  });
});

describe("postEllipseForMessage", () => {
  it("fait poser l'ellipse par la base, puis rend le bloc et l'id à désigner", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "e1", days: 3 }, error: null });
    const result = await postEllipseForMessage({ rpc }, "c1", { days: 3, icon: "cloud-rain", position: 48 });
    expect(rpc).toHaveBeenCalledWith("post_chatroom_ellipse", { p_chat: "c1", p_days: 3, p_icon: "cloud-rain", p_position: 48 });
    expect(result).toEqual({ ok: true, ellipseId: "e1", text: JSON.stringify({ _type: "ellipse" }) });
  });

  it("traduit un refus de la base", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "not_allowed" } });
    expect(await postEllipseForMessage({ rpc }, "c1", { days: 1, icon: "sun", position: 0 })).toEqual({ ok: false, error: "notAllowed" });
    expect(ellipseErrorKey("ellipse_invalid_days")).toBe("invalid");
    expect(ellipseErrorKey("boom")).toBe("failed");
  });
});
