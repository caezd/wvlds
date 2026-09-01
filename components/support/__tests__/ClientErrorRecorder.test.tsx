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
