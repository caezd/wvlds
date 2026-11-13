import { describe, it, expect } from "vitest";

import { withOpacity } from "@/lib/colorOpacity";

describe("withOpacity", () => {
  it("mélange la couleur avec du transparent", () => {
    expect(withOpacity("#1d4ed8", 0.2)).toBe("color-mix(in srgb, #1d4ed8 20%, transparent)");
  });

  it("garde une couleur qui porte déjà son opacité intacte", () => {
    expect(withOpacity("#1d4ed880", 0.2)).toBe("color-mix(in srgb, #1d4ed880 20%, transparent)");
  });

  it("borne l'opacité entre 0 et 1", () => {
    expect(withOpacity("#000", 2)).toBe("color-mix(in srgb, #000 100%, transparent)");
    expect(withOpacity("#000", -1)).toBe("color-mix(in srgb, #000 0%, transparent)");
  });
});
