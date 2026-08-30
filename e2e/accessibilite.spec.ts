import { test, expect } from "@playwright/test";

import { violations, rapport } from "./axe";

// ──────────────────────────────────────────────────────────────────────────
// Accessibilité des pages accessibles SANS session.
//
// Le pendant public de `accessibilite.authed.spec.ts`. Ces pages n'avaient
// aucune violation au moment où ce contrôle a été écrit — c'est justement
// pourquoi il vaut la peine : elles forment le premier contact avec
// l'application, et c'est déjà cet arbre qui, une fois, l'a abattue en entier
// (cf. l'en-tête de `routes.authed.spec.ts`).
//
// Elles ne demandent pas de session : elles tournent donc dans le projet
// `chromium`, sans dépendre du compte de test.
// ──────────────────────────────────────────────────────────────────────────

const ROUTES = [
  "/auth/login",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/sign-up-success",
  "/legal",
];

test.describe("accessibilité des pages publiques", () => {
  test.describe.configure({ mode: "default" });
  test.setTimeout(120_000);

  test("aucune violation WCAG A/AA sans session", async ({ page }) => {
    const fautes: string[] = [];
    let analysees = 0;
    for (const route of ROUTES) {
      fautes.push(...(await violations(page, route)));
      analysees++;
    }
    // Garde-fou du garde-fou : une exécution qui n'aurait rien analysé
    // passerait aussi, et ne dirait rien.
    expect(analysees).toBe(ROUTES.length);
    expect(fautes, rapport(fautes)).toEqual([]);
  });
});
