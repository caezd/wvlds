import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

import { ClientErrorRecorder } from "@/components/support/ClientErrorRecorder";
import { lireErreursClient, oublierErreursClient } from "@/lib/clientErrorLog";

beforeEach(() => oublierErreursClient());
afterEach(() => vi.restoreAllMocks());

/**
 * Ce que le navigateur émet pour une erreur non rattrapée.
 *
 * L'événement est annulable, et un écouteur l'annule : sans quoi jsdom fait
 * remonter l'erreur jusqu'au processus, où vitest la compte comme une erreur
 * non rattrapée du test — un vrai navigateur, lui, se contente de la journaliser
 * dans la console. C'est exactement ce que fait `event.preventDefault()` dans
 * une page qui traite ses propres erreurs.
 */
function erreurNonRattrapee(message: string, fichier = "app.js", ligne = 42) {
  const evenement = new Event("error", { cancelable: true }) as ErrorEvent;
  Object.assign(evenement, { message, filename: fichier, lineno: ligne, error: new Error(message) });
  window.addEventListener("error", (e) => e.preventDefault(), { once: true });
  window.dispatchEvent(evenement);
}

describe("ClientErrorRecorder", () => {
  it("retient une erreur non rattrapée, avec l'endroit où elle est survenue", () => {
    render(<ClientErrorRecorder />);

    erreurNonRattrapee("Cannot read properties of undefined");

    const [entrée] = lireErreursClient();
    expect(entrée.kind).toBe("uncaught");
    expect(entrée.message).toBe("Cannot read properties of undefined");
    expect(entrée.source).toBe("app.js:42");
  });

  // Une promesse rejetée sans `catch` n'émet PAS d'événement « error » : sans
  // cette seconde écoute, tout un pan des pannes resterait invisible.
  it("retient une promesse rejetée", () => {
    render(<ClientErrorRecorder />);

    const evenement = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(evenement, { reason: new Error("réseau indisponible") });
    window.dispatchEvent(evenement);

    expect(lireErreursClient()[0]).toMatchObject({
      kind: "rejection",
      message: "réseau indisponible",
    });
  });

  // C'est par là que passent les erreurs de rendu de React et les deux
  // frontières d'erreur de l'application : le message d'origine n'est lisible
  // nulle part ailleurs.
  it("retient ce qui est déposé dans console.error, sans le retenir à la console", () => {
    const console_ = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ClientErrorRecorder />);

    console.error("Erreur non rattrapée dans une page protégée :", new Error("boum"));

    expect(console_).toHaveBeenCalled();
    const [entrée] = lireErreursClient();
    expect(entrée.kind).toBe("console");
    expect(entrée.message).toContain("boum");
    expect(entrée.stack).toBeDefined();
  });

  // React et Next journalisent sous la forme
  // `console.error("%c%s%c ...", css, préfixe, css)`. Coller les arguments bout
  // à bout donnait des lignes où le style de la console noyait le seul texte
  // qui compte.
  it("applique les directives de format au lieu de les recopier", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ClientErrorRecorder />);

    console.error(
      "%c%s%c Server MISSING_MESSAGE: Could not resolve `admin.bugReports.filterAll`",
      "background: #e6e6e6;color: #000000",
      "Server",
      "background: light-dark(rgba(0,0,0,0.1));border-radius: 2px",
    );

    const [entrée] = lireErreursClient();
    expect(entrée.message).toBe(
      "Server Server MISSING_MESSAGE: Could not resolve `admin.bugReports.filterAll`",
    );
    expect(entrée.message).not.toContain("%c");
    expect(entrée.message).not.toContain("background:");
  });

  it("laisse intact un message sans directive", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ClientErrorRecorder />);

    console.error("Erreur non rattrapée :", new Error("boum"));

    expect(lireErreursClient()[0].message).toBe("Erreur non rattrapée : boum");
  });

  // Un pourcentage littéral ne consomme aucun argument.
  it("ne prend pas un pourcentage échappé pour une directive", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ClientErrorRecorder />);

    console.error("Chargé à 100%% — %s", "terminé");

    expect(lireErreursClient()[0].message).toBe("Chargé à 100% — terminé");
  });

  describe("piles d'appels", () => {
    function noterAvec(stack: string) {
      vi.spyOn(console, "error").mockImplementation(() => {});
      render(<ClientErrorRecorder />);
      const erreur = new Error("boum");
      erreur.stack = stack;
      console.error(erreur);
      return lireErreursClient()[0].stack ?? "";
    }

    // Le cadre le plus utile d'une erreur de rendu vit dans un chunk « .next » :
    // écarter sur ce mot jetterait précisément la ligne qu'on cherche. Le tri se
    // fait donc sur les bibliothèques.
    it("garde le cadre applicatif et jette la mécanique de React", () => {
      const pile = noterAvec(
        [
          "Error: boum",
          "SidebarRail@about://React/Server/C:/dev/wvlds/.next/server/chunks/ssr/_0j1kqym.js?308:460:41",
          "resolveErrorDev@http://localhost:3000/_next/static/chunks/1y46_next_dist_compiled_react-server-dom-turbopack.js?1919:120",
          "parseModelString@http://localhost:3000/_next/static/chunks/1y46_next_dist_compiled_react-server-dom-turbopack.js?1584:50",
          "monAction@http://localhost:3000/_next/static/chunks/app_actions.js?12:3",
        ].join(String.fromCharCode(10)),
      );

      expect(pile).toContain("SidebarRail@");
      expect(pile).toContain("monAction@");
      expect(pile).not.toContain("resolveErrorDev");
      expect(pile).not.toContain("parseModelString");
    });

    it("garde la ligne d'en-tête, qui n'est pas un cadre", () => {
      const pile = noterAvec(
        ["TypeError: x is not a function", "  at rien (/node_modules/react-dom/index.js:1:1)"].join(
          String.fromCharCode(10),
        ),
      );

      expect(pile).toContain("TypeError: x is not a function");
    });

    // Une pile illisible reste plus utile que pas de pile du tout.
    it("garde tout quand il ne reste aucun cadre applicatif", () => {
      const pile = noterAvec(
        [
          "Error: boum",
          "  at a (/node_modules/react-dom/index.js:1:1)",
          "  at b (/node_modules/scheduler.js:2:2)",
        ].join(String.fromCharCode(10)),
      );

      expect(pile).toContain("react-dom");
    });

    it("ne garde pas une pile interminable", () => {
      const pile = noterAvec(
        Array.from({ length: 40 }, (_, i) => `cadre${i}@http://localhost:3000/app.js:${i}:1`).join(
          String.fromCharCode(10),
        ),
      );

      expect(pile.split(String.fromCharCode(10))).toHaveLength(12);
    });
  });

  // Le journal sert à comprendre un signalement : le remplir de messages
  // d'outillage le rendrait illisible là où il compte.
  it("écarte le bruit du serveur de développement", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ClientErrorRecorder />);

    console.error("[Fast Refresh] rebuilding");

    expect(lireErreursClient()).toEqual([]);
  });

  it("rend sa console intacte en partant", () => {
    const avant = console.error;
    const { unmount } = render(<ClientErrorRecorder />);
    unmount();

    expect(console.error).toBe(avant);
  });

  it("n'écoute plus une fois démonté", () => {
    const { unmount } = render(<ClientErrorRecorder />);
    unmount();

    erreurNonRattrapee("trop tard");

    expect(lireErreursClient()).toEqual([]);
  });
});
