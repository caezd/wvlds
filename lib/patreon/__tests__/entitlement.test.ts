import { describe, it, expect } from "vitest";
import { resolvePlan } from "@/lib/patreon/entitlement";

const MIN = 499;

describe("resolvePlan", () => {
  it("mécène actif au-dessus du palier → subscribed", () => {
    expect(
      resolvePlan({ patronStatus: "active_patron", entitledCents: 500, currentPlan: "free", minCents: MIN }),
    ).toBe("subscribed");
  });

  it("mécène actif pile au palier → subscribed", () => {
    expect(
      resolvePlan({ patronStatus: "active_patron", entitledCents: MIN, currentPlan: "free", minCents: MIN }),
    ).toBe("subscribed");
  });

  it("mécène actif sous le palier → free", () => {
    expect(
      resolvePlan({ patronStatus: "active_patron", entitledCents: 300, currentPlan: "subscribed", minCents: MIN }),
    ).toBe("free");
  });

  it("mécène refusé (declined_patron) → free", () => {
    expect(
      resolvePlan({ patronStatus: "declined_patron", entitledCents: 999, currentPlan: "subscribed", minCents: MIN }),
    ).toBe("free");
  });

  it("ancien mécène (former_patron) → free", () => {
    expect(
      resolvePlan({ patronStatus: "former_patron", entitledCents: 999, currentPlan: "subscribed", minCents: MIN }),
    ).toBe("free");
  });

  it("non lié / aucun statut → free", () => {
    expect(
      resolvePlan({ patronStatus: null, entitledCents: 0, currentPlan: "free", minCents: MIN }),
    ).toBe("free");
  });

  it("lifetime n'est JAMAIS rétrogradé, même sans mécénat actif", () => {
    expect(
      resolvePlan({ patronStatus: "former_patron", entitledCents: 0, currentPlan: "lifetime", minCents: MIN }),
    ).toBe("lifetime");
  });

  it("lifetime reste lifetime même si le mécène est actif (pas de downgrade vers subscribed)", () => {
    expect(
      resolvePlan({ patronStatus: "active_patron", entitledCents: 5000, currentPlan: "lifetime", minCents: MIN }),
    ).toBe("lifetime");
  });
});
