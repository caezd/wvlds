import { describe, it, expect, afterEach, vi } from "vitest";
import {
  bugReportContext,
  isOwnAttachmentPath,
  pageSignaleeDepuis,
  BUG_REPORT_MAX_LENGTH,
  BUG_REPORT_USER_AGENT_MAX_LENGTH,
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

describe("pageSignaleeDepuis", () => {
  it("accepte un chemin de l'application", () => {
    expect(pageSignaleeDepuis("/w/123?view=members")).toBe("/w/123?view=members");
  });

  // Le formulaire AFFICHE cette valeur comme étant la page signalée. Un lien
  // piégé pourrait donc lui faire annoncer une adresse qui n'est pas la nôtre —
  // « //ailleurs.fr » étant lu par les navigateurs comme un autre domaine, et
  // « /\ailleurs.fr » de même par certains.
  it("refuse tout ce qui n'est pas un chemin de l'application", () => {
    expect(pageSignaleeDepuis("https://ailleurs.fr/")).toBeNull();
    expect(pageSignaleeDepuis("//ailleurs.fr/")).toBeNull();
    expect(pageSignaleeDepuis("/" + String.fromCharCode(92) + "ailleurs.fr")).toBeNull();
    expect(pageSignaleeDepuis("javascript:alert(1)")).toBeNull();
    expect(pageSignaleeDepuis("w/123")).toBeNull();
  });

  it("refuse une absence comme un chemin démesuré", () => {
    expect(pageSignaleeDepuis(undefined)).toBeNull();
    expect(pageSignaleeDepuis("")).toBeNull();
    expect(pageSignaleeDepuis(42)).toBeNull();
    expect(pageSignaleeDepuis("/" + "a".repeat(500))).toBeNull();
  });
});

describe("bugReportContext", () => {
  it("joint la page reçue et le navigateur", () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla/5.0 (test)" } });

    expect(bugReportContext("/w/123?view=members")).toEqual({
      pageUrl: "/w/123?view=members",
      userAgent: "Mozilla/5.0 (test)",
    });
  });

  // Le formulaire a sa propre page : relever « window.location » n'y
  // rapporterait que « /bug-report ». Sans page connue, mieux vaut un champ
  // vide qu'une réponse fausse dans la file de tri.
  it("ne joint aucune page quand on ignore d'où vient l'auteur", () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla/5.0 (test)" } });

    expect(bugReportContext(null).pageUrl).toBe("");
    expect(bugReportContext().pageUrl).toBe("");
  });

  // La valeur vient du poste client : un navigateur bavard ferait sinon
  // rejeter toute la ligne par la contrainte de longueur en base.
  it("borne ce que rapporte le navigateur", () => {
    vi.stubGlobal("window", { navigator: { userAgent: "u".repeat(5000) } });

    expect(bugReportContext("/x").userAgent).toHaveLength(BUG_REPORT_USER_AGENT_MAX_LENGTH);
  });
});

describe("isOwnAttachmentPath", () => {
  // Le chemin arrive du client. Sans cette vérification, un rapport pourrait
  // désigner le dépôt de quelqu'un d'autre — et le faire signer, la signature
  // étant demandée au nom de l'administrateur qui le consulte, dont la policy
  // de lecture couvre tout le bucket.
  it("accepte un chemin sous le préfixe de son auteur", () => {
    expect(isOwnAttachmentPath("user-u1/abc.webp", "u1")).toBe(true);
  });

  it("refuse le dépôt d'un autre compte", () => {
    expect(isOwnAttachmentPath("user-u2/abc.webp", "u1")).toBe(false);
    expect(isOwnAttachmentPath("abc.webp", "u1")).toBe(false);
    expect(isOwnAttachmentPath("", "u1")).toBe(false);
  });

  // Un préfixe correct suivi d'une remontée de dossier ressortirait du dépôt
  // de son auteur tout en satisfaisant le test le plus naïf.
  it("refuse une remontée de dossier", () => {
    expect(isOwnAttachmentPath("user-u1/../user-u2/abc.webp", "u1")).toBe(false);
  });

  // Le préfixe d'un autre compte peut commencer par celui-ci : « user-u1 » est
  // un préfixe de « user-u10 ». La barre oblique est ce qui les sépare.
  it("ne confond pas deux comptes dont l'un préfixe l'autre", () => {
    expect(isOwnAttachmentPath("user-u10/abc.webp", "u1")).toBe(false);
  });

  it("refuse un chemin démesuré", () => {
    expect(isOwnAttachmentPath("user-u1/" + "a".repeat(400), "u1")).toBe(false);
  });
});
