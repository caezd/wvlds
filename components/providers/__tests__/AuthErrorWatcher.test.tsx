import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { AuthErrorWatcher } from "@/components/providers/AuthErrorWatcher";
import { annoncerDeconnexion, consommerDeconnexionAnnoncee } from "@/lib/deconnexionVoulue";

// ──────────────────────────────────────────────────────────────────────────
// `onAuthStateChange` émet `SIGNED_OUT` aussi bien quand la personne clique
// « Se déconnecter » que lorsque son jeton expire. Ce surveillant ne doit
// parler que du second cas — sans quoi il annonce « Session expirée » à qui
// vient de partir de son plein gré, et le message, posé sans durée, la suit
// jusqu'à la page de connexion.
// ──────────────────────────────────────────────────────────────────────────

const toastError = vi.fn();
const toastDismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    dismiss: (...args: unknown[]) => toastDismiss(...args),
  },
}));

const chemin = { valeur: "/w/monde-1" };
vi.mock("next/navigation", () => ({ usePathname: () => chemin.valeur }));

/** Retient l'abonné à `onAuthStateChange` pour lui livrer des événements. */
const abonne = { rappel: null as ((e: string, s: unknown) => void) | null };
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (rappel: (e: string, s: unknown) => void) => {
        abonne.rappel = rappel;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    realtime: { setAuth: vi.fn() },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  chemin.valeur = "/w/monde-1";
  consommerDeconnexionAnnoncee();
});

afterEach(() => {
  consommerDeconnexionAnnoncee();
});

function monter() {
  render(<AuthErrorWatcher />);
  return (evenement: string, session: unknown = null) => abonne.rappel?.(evenement, session);
}

describe("AuthErrorWatcher", () => {
  it("annonce la session perdue", () => {
    const emettre = monter();

    emettre("SIGNED_OUT");

    expect(toastError).toHaveBeenCalledWith(
      "Session expirée",
      expect.objectContaining({ description: "Rechargez la page pour continuer." }),
    );
  });

  it("se tait quand la déconnexion a été demandée", () => {
    // Le défaut visible : on cliquait « Se déconnecter » et l'application
    // répondait « Session expirée, rechargez la page ».
    const emettre = monter();
    annoncerDeconnexion();

    emettre("SIGNED_OUT");

    expect(toastError).not.toHaveBeenCalled();
  });

  it("reparle à la perte SUIVANTE", () => {
    // Le drapeau ne vaut que pour un événement : le laisser en place
    // masquerait l'expiration qu'il faut vraiment annoncer.
    const emettre = monter();
    annoncerDeconnexion();
    emettre("SIGNED_OUT");

    emettre("SIGNED_OUT");

    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("se tait déjà sur les pages de connexion", () => {
    chemin.valeur = "/auth/login";
    const emettre = monter();

    emettre("SIGNED_OUT");

    expect(toastError).not.toHaveBeenCalled();
  });

  it("retire l'annonce quand le jeton se renouvelle", () => {
    const emettre = monter();

    emettre("TOKEN_REFRESHED", { access_token: "jeton" });

    expect(toastDismiss).toHaveBeenCalledWith("session-expired");
  });
});
