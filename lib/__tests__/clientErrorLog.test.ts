import { describe, it, expect, beforeEach } from "vitest";
import {
  CLIENT_ERROR_LOG_KEY,
  CLIENT_ERROR_LOG_MAX,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_STACK_MAX,
  enregistrerErreurClient,
  lireErreursClient,
  normaliserJournalClient,
  oublierErreursClient,
} from "@/lib/clientErrorLog";

beforeEach(() => oublierErreursClient());

const erreur = (message: string, extra: Record<string, unknown> = {}) => ({
  at: "2026-09-01T10:00:00.000Z",
  kind: "console",
  message,
  ...extra,
});

describe("enregistrerErreurClient", () => {
  it("retient une erreur et la rend telle quelle", () => {
    enregistrerErreurClient(erreur("Cannot read properties of undefined"));

    expect(lireErreursClient()).toEqual([
      {
        at: "2026-09-01T10:00:00.000Z",
        kind: "console",
        message: "Cannot read properties of undefined",
      },
    ]);
  });

  // Une erreur de rendu se reproduit à chaque tentative : dix lignes identiques
  // chasseraient du journal ce qui l'a précédée — souvent l'explication.
  it("ne répète pas un message, mais garde le plus récent", () => {
    enregistrerErreurClient(erreur("boum"));
    enregistrerErreurClient(erreur("autre chose"));
    enregistrerErreurClient(erreur("boum", { at: "2026-09-01T10:00:09.000Z" }));

    const journal = lireErreursClient();
    expect(journal.map((e) => e.message)).toEqual(["autre chose", "boum"]);
    expect(journal[1].at).toBe("2026-09-01T10:00:09.000Z");
  });

  it("ne garde que les dernières erreurs", () => {
    for (let i = 0; i < CLIENT_ERROR_LOG_MAX + 5; i++) {
      enregistrerErreurClient(erreur(`erreur ${i}`));
    }

    const journal = lireErreursClient();
    expect(journal).toHaveLength(CLIENT_ERROR_LOG_MAX);
    expect(journal[journal.length - 1].message).toBe(`erreur ${CLIENT_ERROR_LOG_MAX + 4}`);
  });

  // La pile d'une erreur minifiée peut faire plusieurs milliers de caractères :
  // sans borne, le journal pèserait plus lourd que le signalement, et la
  // contrainte de la migration 146 rejetterait toute la ligne.
  it("borne message et pile", () => {
    enregistrerErreurClient(erreur("m".repeat(5000), { stack: "s".repeat(9000) }));

    const [entrée] = lireErreursClient();
    expect(entrée.message).toHaveLength(CLIENT_ERROR_MESSAGE_MAX);
    expect(entrée.stack).toHaveLength(CLIENT_ERROR_STACK_MAX);
  });

  it("ignore ce qui n'est pas une erreur exploitable", () => {
    enregistrerErreurClient(null);
    enregistrerErreurClient("boum");
    enregistrerErreurClient({ message: "   " });
    enregistrerErreurClient({ kind: "console" });

    expect(lireErreursClient()).toEqual([]);
  });

  it("survit à la fermeture de la page, le journal vivant dans la session", () => {
    enregistrerErreurClient(erreur("boum"));

    // Ce que relirait une page rechargée : le stockage, et non l'état du module.
    expect(JSON.parse(window.sessionStorage.getItem(CLIENT_ERROR_LOG_KEY) ?? "[]")).toHaveLength(1);
  });
});

describe("normaliserJournalClient", () => {
  // Le journal traverse le réseau : l'action serveur le renormalise plutôt que
  // de le croire sur parole.
  it("écarte les entrées irrecevables sans perdre les autres", () => {
    const journal = normaliserJournalClient([erreur("bon"), null, 42, { message: "" }, erreur("bon aussi")]);

    expect(journal.map((e) => e.message)).toEqual(["bon", "bon aussi"]);
  });

  it("retombe sur une origine connue quand elle est fantaisiste", () => {
    expect(normaliserJournalClient([erreur("x", { kind: "piraté" })])[0].kind).toBe("console");
  });

  it("réécrit un horodatage invalide plutôt que de le transmettre", () => {
    const [entrée] = normaliserJournalClient([erreur("x", { at: "hier" })]);

    expect(Number.isNaN(Date.parse(entrée.at))).toBe(false);
  });

  it("rend un journal vide de tout ce qui n'est pas un tableau", () => {
    expect(normaliserJournalClient(undefined)).toEqual([]);
    expect(normaliserJournalClient({ 0: erreur("x") })).toEqual([]);
  });

  it("ne laisse pas passer plus d'entrées que la base n'en accepte", () => {
    const trop = Array.from({ length: 40 }, (_, i) => erreur(`erreur ${i}`));

    expect(normaliserJournalClient(trop)).toHaveLength(CLIENT_ERROR_LOG_MAX);
  });
});
