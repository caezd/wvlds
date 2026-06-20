import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DateDisplay } from "@/components/date-display";

describe("DateDisplay", () => {
  it("formate une date ISO en français, figée sur UTC", () => {
    const { container } = render(<DateDisplay value="2026-06-20T15:30:00+00:00" />);
    const text = container.textContent ?? "";
    expect(text).toContain("juin");
    expect(text).toContain("2026");
    // timeZone UTC figé → 15 h 30 quelle que soit la TZ de la machine
    expect(text).toContain("15 h 30");
  });

  it("rend l'heure en UTC indépendamment du décalage d'entrée", () => {
    const { container } = render(<DateDisplay value="2026-01-01T23:00:00+02:00" />);
    // 23:00+02:00 == 21:00 UTC
    expect(container.textContent).toContain("21 h 00");
  });
});
