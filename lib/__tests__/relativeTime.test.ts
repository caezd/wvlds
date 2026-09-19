import { describe, it, expect } from "vitest";

import { daysUntilBirthday, formatBirthday, localTimeIn, relativeTime, supportedTimezones } from "@/lib/relativeTime";
import { effectiveStatus } from "@/lib/worldMembers";

describe("relativeTime", () => {
  const now = Date.UTC(2026, 8, 19, 12, 0, 0);

  it("rend « à l'instant » sous la minute, puis des durées relatives dans la langue", () => {
    expect(relativeTime(new Date(now - 10_000).toISOString(), "fr", "à l'instant", now)).toBe("à l'instant");
    expect(relativeTime(new Date(now - 3 * 60_000).toISOString(), "fr", "—", now)).toMatch(/3 min/);
    expect(relativeTime(new Date(now - 5 * 3_600_000).toISOString(), "en", "—", now)).toMatch(/5 hours ago/);
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString(), "fr", "—", now)).toMatch(/avant-hier|2 jours/);
  });

  it("au-delà d'un mois, une date", () => {
    const old = new Date(now - 60 * 86_400_000).toISOString();
    expect(relativeTime(old, "fr", "—", now)).toMatch(/2026/);
  });
});

describe("localTimeIn", () => {
  it("donne l'heure dans le fuseau, et null pour un fuseau inconnu", () => {
    const at = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    expect(localTimeIn("Asia/Tokyo", "fr", at)).toMatch(/21[:h]00/);
    expect(localTimeIn("Not/AZone", "fr", at)).toBeNull();
  });

  it("supportedTimezones ne rend jamais une liste vide", () => {
    expect(supportedTimezones().length).toBeGreaterThan(0);
  });
});

describe("daysUntilBirthday", () => {
  it("0 le jour même, et le nombre de jours jusqu'au prochain", () => {
    const today = new Date(2026, 8, 19);
    expect(daysUntilBirthday(9, 19, today)).toBe(0);
    expect(daysUntilBirthday(9, 29, today)).toBe(10);
  });

  it("passe à l'année suivante quand la date est déjà passée", () => {
    const today = new Date(2026, 8, 19);
    expect(daysUntilBirthday(9, 18, today)).toBe(364);
    expect(daysUntilBirthday(1, 5, today)).toBe(108);
  });

  it("un 29 février compte pour le 1er mars les années sans", () => {
    const today = new Date(2026, 1, 20);
    expect(daysUntilBirthday(2, 29, today)).toBe(9);
  });
});

describe("formatBirthday", () => {
  it("le jour et le mois, sans année", () => {
    expect(formatBirthday(10, 12, "fr")).toMatch(/12 oct/);
    expect(formatBirthday(10, 12, "en")).toMatch(/Oct 12/);
  });
});

describe("effectiveStatus", () => {
  const now = new Date(2026, 8, 19, 10);
  it("une pause sans date, ou à venir, tient ; une pause échue vaut « actif »", () => {
    expect(effectiveStatus({ status: "paused", status_until: null }, now)).toBe("paused");
    expect(effectiveStatus({ status: "away", status_until: "2026-09-30" }, now)).toBe("away");
    expect(effectiveStatus({ status: "away", status_until: "2026-09-18" }, now)).toBe("active");
    // Le jour du retour, on est encore absent jusqu'au soir.
    expect(effectiveStatus({ status: "paused", status_until: "2026-09-19" }, now)).toBe("paused");
    expect(effectiveStatus({ status: "active", status_until: "2026-09-30" }, now)).toBe("active");
  });
});
