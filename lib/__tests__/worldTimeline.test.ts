import { describe, it, expect } from "vitest";
import {
  DEFAULT_DAYS_PER_MONTH,
  daysInMonth,
  formatTimelineLabel,
  REAL_DAYS_PER_MONTH,
  REAL_MONTH_NAMES,
} from "@/lib/worldTimeline";
import type { WorldTimelineConfig } from "@/types/worlds";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  current_year: 1327,
  current_month: 0,
};

describe("formatTimelineLabel", () => {
  it("inclut le jour et le mois quand les deux sont précisés", () => {
    expect(formatTimelineLabel(CONFIG, { year: 1327, month: 0, day: 3 })).toBe("3 Janvier, An 1327");
  });

  it("omet le jour quand seul le mois est précisé", () => {
    expect(formatTimelineLabel(CONFIG, { year: 1327, month: 1, day: null })).toBe("Février, An 1327");
  });

  it("retombe sur l'année seule quand ni mois ni jour ne sont précisés", () => {
    expect(formatTimelineLabel(CONFIG, { year: 1327, month: null, day: null })).toBe("An 1327");
  });

  it("ignore le jour si le mois n'est pas précisé, même si le jour l'est", () => {
    // Un jour sans mois n'a pas de sens à afficher seul — l'étiquette
    // retombe sur l'année, comme si le jour n'était pas précisé.
    expect(formatTimelineLabel(CONFIG, { year: 1327, month: null, day: 12 })).toBe("An 1327");
  });

  it("ajoute le nom de l'ère quand il est défini", () => {
    const withEra = { ...CONFIG, era_name: "après la Chute" };
    expect(formatTimelineLabel(withEra, { year: 1327, month: null, day: null })).toBe("An 1327 après la Chute");
  });
});

describe("daysInMonth", () => {
  it("retourne la longueur propre à chaque mois, pas une valeur unique", () => {
    const config: WorldTimelineConfig = { ...CONFIG, days_per_month: [31, 28, 31] };
    expect(daysInMonth(config, 0)).toBe(31);
    expect(daysInMonth(config, 1)).toBe(28);
  });

  it("retombe sur la valeur par défaut pour un mois sans entrée (config enregistrée avant ce réglage)", () => {
    expect(daysInMonth({ ...CONFIG, days_per_month: undefined }, 0)).toBe(DEFAULT_DAYS_PER_MONTH);
    // Tableau plus court que `month_names` (mois ajouté avant ce réglage).
    expect(daysInMonth({ ...CONFIG, days_per_month: [31] }, 1)).toBe(DEFAULT_DAYS_PER_MONTH);
  });

  it("le préréglage « mois réels » a autant de longueurs que de noms de mois", () => {
    expect(REAL_DAYS_PER_MONTH).toHaveLength(REAL_MONTH_NAMES.length);
  });
});
