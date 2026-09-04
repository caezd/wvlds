import { describe, it, expect } from "vitest";
import {
  clampDaysPerMonth,
  compareTimelineDates,
  isWithinTimeline,
  DEFAULT_DAYS_PER_MONTH,
  daysInMonth,
  formatTimelineLabel,
  MAX_DAYS_PER_MONTH,
  MIN_DAYS_PER_MONTH,
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

  it("borne une valeur enregistrée hors limites — les attributs HTML min/max ne l'empêchent pas", () => {
    // Régression (retour Copilot) : un `<input type=number min max>` n'écrête
    // pas la valeur saisie ; sans ce garde-fou, la valeur alimentait ensuite
    // un `Array.from({ length })` dans le widget de calendrier.
    expect(daysInMonth({ ...CONFIG, days_per_month: [0] }, 0)).toBe(MIN_DAYS_PER_MONTH);
    expect(daysInMonth({ ...CONFIG, days_per_month: [-5] }, 0)).toBe(MIN_DAYS_PER_MONTH);
    expect(daysInMonth({ ...CONFIG, days_per_month: [999_999] }, 0)).toBe(MAX_DAYS_PER_MONTH);
    expect(daysInMonth({ ...CONFIG, days_per_month: [15.7] }, 0)).toBe(16);
  });
});

describe("clampDaysPerMonth", () => {
  it("laisse passer une valeur déjà dans les bornes", () => {
    expect(clampDaysPerMonth(30)).toBe(30);
  });

  it("arrondit une valeur décimale à l'entier le plus proche", () => {
    expect(clampDaysPerMonth(15.4)).toBe(15);
    expect(clampDaysPerMonth(15.5)).toBe(16);
  });

  it("borne au minimum/maximum plutôt que de laisser passer une valeur aberrante", () => {
    expect(clampDaysPerMonth(0)).toBe(MIN_DAYS_PER_MONTH);
    expect(clampDaysPerMonth(-42)).toBe(MIN_DAYS_PER_MONTH);
    expect(clampDaysPerMonth(1_000_000)).toBe(MAX_DAYS_PER_MONTH);
  });

  it("retombe sur la valeur par défaut pour une entrée non finie (NaN, saisie vidée)", () => {
    expect(clampDaysPerMonth(Number.NaN)).toBe(DEFAULT_DAYS_PER_MONTH);
    expect(clampDaysPerMonth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_DAYS_PER_MONTH);
  });
});

describe("compareTimelineDates", () => {
  it("ordonne par année, puis mois, puis jour", () => {
    expect(compareTimelineDates({ year: 1200, month: 5, day: 3 }, { year: 1201, month: 0, day: 1 })).toBe(-1);
    expect(compareTimelineDates({ year: 1200, month: 5, day: 3 }, { year: 1200, month: 2, day: 9 })).toBe(1);
    expect(compareTimelineDates({ year: 1200, month: 5, day: 3 }, { year: 1200, month: 5, day: 4 })).toBe(-1);
    expect(compareTimelineDates({ year: 1200, month: 5, day: 3 }, { year: 1200, month: 5, day: 3 })).toBe(0);
  });

  it("s'arrête à la finesse que toutes deux ont", () => {
    // « L'an 1200 » et « le 3 mars 1200 » sont la même époque.
    expect(compareTimelineDates({ year: 1200, month: null, day: null }, { year: 1200, month: 2, day: 3 })).toBe(0);
    expect(compareTimelineDates({ year: 1200, month: 2, day: null }, { year: 1200, month: 2, day: 30 })).toBe(0);
  });
});

describe("isWithinTimeline", () => {
  const AN = (year: number) => ({ year, month: null, day: null });

  it("tient entre deux bornes, bornes comprises", () => {
    expect(isWithinTimeline(AN(1250), AN(1200), AN(1300))).toBe(true);
    expect(isWithinTimeline(AN(1200), AN(1200), AN(1300))).toBe(true);
    expect(isWithinTimeline(AN(1300), AN(1200), AN(1300))).toBe(true);
    expect(isWithinTimeline(AN(1199), AN(1200), AN(1300))).toBe(false);
    expect(isWithinTimeline(AN(1301), AN(1200), AN(1300))).toBe(false);
  });

  it("une borne absente ne borne rien", () => {
    // Un lieu sans dates est de toujours à toujours.
    expect(isWithinTimeline(AN(1), null, null)).toBe(true);
    expect(isWithinTimeline(AN(5000), AN(1200), null)).toBe(true);
    expect(isWithinTimeline(AN(-3000), undefined, AN(1300))).toBe(true);
  });
});
