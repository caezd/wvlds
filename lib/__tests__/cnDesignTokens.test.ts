import { describe, it, expect } from "vitest";

import { cn } from "@/lib/utils";

describe("cn et les jetons maison", () => {
  it("une couleur de texte n'efface pas la taille text-xs-plus ou text-2xs", () => {
    expect(cn("text-xs-plus text-npc")).toBe("text-xs-plus text-npc");
    expect(cn("text-2xs text-accent")).toBe("text-2xs text-accent");
  });

  it("une taille de l'échelle remplace l'autre", () => {
    expect(cn("text-sm text-xs-plus")).toBe("text-xs-plus");
  });

  it("un plan nommé remplace un z-index numérique, une ombre nommée une autre ombre", () => {
    expect(cn("z-50 z-popover")).toBe("z-popover");
    expect(cn("shadow-md shadow-floating")).toBe("shadow-floating");
  });
});
