import { describe, it, expect, vi, afterEach } from "vitest";

import {
  announceSignOut,
  consumeAnnouncedSignOut,
} from "@/lib/intentionalSignOut";

// ──────────────────────────────────────────────────────────────────────────
// `onAuthStateChange` émet `SIGNED_OUT` aussi bien quand la personne clique
// « Se déconnecter » que lorsque son jeton expire. Le surveillant de session
// annonçait donc « Session expirée — rechargez la page » à qui venait de
// partir de son plein gré, et le message la suivait jusqu'à la page de
// connexion.
// ──────────────────────────────────────────────────────────────────────────

afterEach(() => {
  // L'état est un module : un test qui laisse le drapeau levé fausserait le
  // suivant.
  consumeAnnouncedSignOut();
  vi.useRealTimers();
});

describe("deconnexionVoulue", () => {
  it("ne dit rien tant que personne n'a demandé à partir", () => {
    expect(consumeAnnouncedSignOut()).toBe(false);
  });

  it("reconnaît le départ annoncé", () => {
    announceSignOut();
    expect(consumeAnnouncedSignOut()).toBe(true);
  });

  it("ne vaut que pour UN `SIGNED_OUT`", () => {
    // Le second est une vraie perte de session : il doit s'annoncer.
    announceSignOut();
    consumeAnnouncedSignOut();
    expect(consumeAnnouncedSignOut()).toBe(false);
  });

  it("s'oublie de lui-même si l'événement attendu ne vient pas", () => {
    // Un `signOut` qui échoue laisserait sinon le drapeau levé, à masquer la
    // prochaine expiration — celle qu'il faut vraiment annoncer.
    vi.useFakeTimers();
    announceSignOut();

    vi.advanceTimersByTime(10_000);

    expect(consumeAnnouncedSignOut()).toBe(false);
  });

  it("tient jusqu'à l'oubli, pas moins", () => {
    vi.useFakeTimers();
    announceSignOut();

    vi.advanceTimersByTime(9_000);

    expect(consumeAnnouncedSignOut()).toBe(true);
  });
});
