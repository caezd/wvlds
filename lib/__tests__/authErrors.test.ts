import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { messageErreurAuth, CLES_ERREUR_AUTH } from "@/lib/authErrors";
import { ERR_NON_AUTHENTIFIE, ERR_NOM_UTILISATEUR_PRIS } from "@/lib/actionErrors";

// ──────────────────────────────────────────────────────────────────────────
// Les formulaires de connexion, d'inscription et de mot de passe oublié
// affichaient `error.message` tel quel.
//
// Deux défauts derrière une seule ligne :
//
//  1. Ce message vient de Supabase et il est TOUJOURS en anglais. Une personne
//     lisant l'application en français recevait « Invalid login credentials »
//     au moment précis où elle a besoin d'être comprise.
//
//  2. `UsernameRequiredDialog` et `update-password-form` font `throw error`
//     sur une requête PostgREST : `.message` y est le texte brut de
//     PostgreSQL, qui nomme la table et la policy.
//
// L'arbre `app/auth/**` ne reçoit QUE le namespace `auth` (cf.
// app/auth/layout.tsx et lib/__tests__/clientMessages.test.ts) : c'est pour
// cela que ces messages y vivent, et pas dans `common`.
// ──────────────────────────────────────────────────────────────────────────

/** `useTranslations("auth")` factice : rend la clé demandée. */
const t = (cle: string) => `traduit:${cle}`;

afterEach(() => vi.restoreAllMocks());

/** Fait taire la console : le chemin générique journalise volontairement. */
function sansJournal() {
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("messageErreurAuth", () => {
  it("traduit les codes Supabase qui disent quelque chose d'utile", () => {
    expect(messageErreurAuth({ code: "invalid_credentials" }, t))
      .toBe("traduit:errorInvalidCredentials");
    expect(messageErreurAuth({ code: "email_not_confirmed" }, t))
      .toBe("traduit:errorEmailNotConfirmed");
    // Deux codes distincts partagent le même message : c'est voulu.
    expect(messageErreurAuth({ code: "over_email_send_rate_limit" }, t))
      .toBe("traduit:errorTooManyRequests");
    expect(messageErreurAuth({ code: "over_request_rate_limit" }, t))
      .toBe("traduit:errorTooManyRequests");
  });

  it("reconnaît aussi nos propres codes, portés par le message", () => {
    // Nos exceptions n'ont pas de champ `code` : elles SONT le code.
    expect(messageErreurAuth(new Error(ERR_NON_AUTHENTIFIE), t))
      .toBe("traduit:errorSessionExpired");
    expect(messageErreurAuth(new Error(ERR_NOM_UTILISATEUR_PRIS), t))
      .toBe("traduit:errorUsernameTaken");
  });

  it("n'affiche JAMAIS le message brut de l'erreur", () => {
    sansJournal();
    // Le cas qui comptait : cette chaîne arrivait telle quelle à l'écran.
    const brut = new Error('new row violates row-level security policy for table "profiles"');
    const affiche = messageErreurAuth(brut, t);
    expect(affiche).toBe("traduit:errorGeneric");
    expect(affiche).not.toContain("profiles");
    expect(affiche).not.toContain("policy");
  });

  it("ne laisse pas passer un message anglais de Supabase", () => {
    sansJournal();
    // Une AuthError sans code reconnu : son texte anglais ne doit pas sortir.
    expect(messageErreurAuth({ code: "inconnu", message: "Invalid login credentials" }, t))
      .toBe("traduit:errorGeneric");
  });

  it("supporte l'absence d'erreur", () => {
    expect(messageErreurAuth(null, t)).toBe("traduit:errorGeneric");
    expect(messageErreurAuth(undefined, t)).toBe("traduit:errorGeneric");
  });

  it("journalise le détail côté console, et seulement lui", () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    const erreur = new Error("détail technique");
    messageErreurAuth(erreur, t);
    expect(journal).toHaveBeenCalledWith("[auth]", erreur);
    // Un code reconnu n'a rien à journaliser : ce n'est pas une anomalie.
    journal.mockClear();
    messageErreurAuth({ code: "invalid_credentials" }, t);
    expect(journal).not.toHaveBeenCalled();
  });

  it("n'utilise que des clés qui existent dans les trois langues", () => {
    // Une clé absente afficherait son propre nom à l'utilisateur.
    for (const langue of ["fr", "en", "es"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf-8"),
      ) as { auth: Record<string, unknown> };
      for (const cle of CLES_ERREUR_AUTH) {
        expect(typeof messages.auth[cle], `auth.${cle} manquante en ${langue}`).toBe("string");
      }
    }
  });

  it("couvre bien plusieurs codes", () => {
    // Une table vide passerait tous les tests ci-dessus sauf celui-ci.
    expect(CLES_ERREUR_AUTH.length).toBeGreaterThan(5);
  });
});
