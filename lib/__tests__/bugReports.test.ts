import { describe, it, expect, afterEach, vi } from "vitest";
import {
  BUG_REPORT_MAX_LENGTH,
  BUG_REPORT_URL_MAX_LENGTH,
  BUG_REPORT_USER_AGENT_MAX_LENGTH,
  captureBugReportContext,
  isBugReportStatus,
  isValidBugReportDescription,
} from "@/lib/bugReports";

afterEach(() => vi.unstubAllGlobals());

describe("isValidBugReportDescription", () => {
  it("refuse un signalement vide ou fait d'espaces", () => {
    expect(isValidBugReportDescription("")).toBe(false);
    expect(isValidBugReportDescription("   \n  ")).toBe(false);
  });

  it("accepte un signalement ordinaire", () => {
    expect(isValidBugReportDescription("Le bouton ne répond pas.")).toBe(true);
  });

  // Refusé plutôt que tronqué : couper au milieu d'une phrase sans le dire
  // priverait le rapport de sa fin, alors que le compteur du formulaire
  // avertit avant l'envoi.
  it("refuse au-delà de la borne, y compris à un caractère près", () => {
    expect(isValidBugReportDescription("a".repeat(BUG_REPORT_MAX_LENGTH))).toBe(true);
    expect(isValidBugReportDescription("a".repeat(BUG_REPORT_MAX_LENGTH + 1))).toBe(false);
  });

  // La borne porte sur le texte utile : des espaces de fin ne doivent pas faire
  // refuser un signalement qui tient dans la limite.
  it("mesure le texte débarrassé de ses espaces", () => {
    expect(isValidBugReportDescription("a".repeat(BUG_REPORT_MAX_LENGTH) + "   ")).toBe(true);
  });
});

describe("isBugReportStatus", () => {
  it("reconnaît les statuts du cycle de tri", () => {
    for (const s of ["new", "in_progress", "resolved", "declined"]) {
      expect(isBugReportStatus(s)).toBe(true);
    }
  });

  // La valeur arrive d'un appel client : tout ce qui n'est pas un statut connu
  // doit être refusé avant d'atteindre la base, dont la contrainte CHECK
  // rejetterait la ligne par une erreur PostgreSQL brute.
  it("refuse tout le reste", () => {
    for (const v of ["", "NEW", "spam", null, undefined, 42, {}]) {
      expect(isBugReportStatus(v)).toBe(false);
    }
  });
});

describe("captureBugReportContext", () => {
  it("relève la page courante et le navigateur", () => {
    vi.stubGlobal("window", {
      location: { href: "https://exemple.fr/w/123?view=members" },
      navigator: { userAgent: "Mozilla/5.0 (test)" },
    });

    expect(captureBugReportContext()).toEqual({
      pageUrl: "https://exemple.fr/w/123?view=members",
      userAgent: "Mozilla/5.0 (test)",
    });
  });

  // Ces deux valeurs viennent du poste client : un navigateur bavard ferait
  // sinon rejeter toute la ligne par la contrainte de longueur en base.
  it("borne ce que rapporte le navigateur", () => {
    vi.stubGlobal("window", {
      location: { href: "https://exemple.fr/" + "a".repeat(5000) },
      navigator: { userAgent: "u".repeat(5000) },
    });

    const contexte = captureBugReportContext();
    expect(contexte.pageUrl).toHaveLength(BUG_REPORT_URL_MAX_LENGTH);
    expect(contexte.userAgent).toHaveLength(BUG_REPORT_USER_AGENT_MAX_LENGTH);
  });
});
