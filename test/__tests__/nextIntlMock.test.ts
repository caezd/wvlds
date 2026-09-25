import { describe, it, expect } from "vitest";
import { useTranslations } from "next-intl";

// Le mock de next-intl (vitest.setup.ts) lit les vrais messages français.
// Il ne résolvait pas les blocs ICU : un pluriel sortait en « 2 other {# mois}} »,
// et aucun test ne pouvait vérifier un accord. Ces cas le tiennent.

describe("mock de next-intl — format ICU", () => {
  it("accorde un pluriel selon les règles du français (0 et 1 au singulier)", () => {
    const t = useTranslations("worlds.members");
    expect(t("morePersonas", { count: 0 })).toBe("0 autre persona");
    expect(t("morePersonas", { count: 1 })).toBe("1 autre persona");
    expect(t("morePersonas", { count: 3 })).toBe("3 autres personas");
  });

  it("résout deux pluriels dans la même phrase", () => {
    const t = useTranslations("worlds.settings");
    expect(t("yearLength", { months: 12, days: 365 })).toBe("12 mois · 365 jours par an");
    expect(t("yearLength", { months: 1, days: 1 })).toBe("1 mois · 1 jour par an");
  });

  it("garde la substitution simple", () => {
    const t = useTranslations("worlds.settings");
    expect(t("deleteMonth", { month: "Givre" })).toBe("Supprimer le mois Givre");
  });

  it("laisse visible une variable manquante plutôt que de l'effacer", () => {
    const t = useTranslations("worlds.settings");
    expect(t("deleteMonth", {})).toBe("Supprimer le mois {month}");
  });
});
