import { test, expect } from "@playwright/test";

// Onglet « Annonces » des réglages d'un monde (migration 227).
//
// Le compte de test possède « Monde E2E » : il y a donc la permission
// `members.announce`. Le test monte l'onglet en vrai (providers, next-intl,
// RPC de comptage et d'historique) et va jusqu'à l'aperçu, SANS envoyer : un
// envoi écrirait des messages privés ou des notifications réels.
//
// Rien n'y dépend de la langue du compte : sélecteurs par identifiant de test,
// et l'onglet par sa valeur Radix (`…-trigger-announcements`).

const MONDE = "Monde E2E";

test.describe("Annonces d'un monde", () => {
  test("l'onglet compte les destinataires et prévisualise le message", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page).toHaveURL(/\/(w\/|explore)/, { timeout: 20_000 });

    // On change de monde par le sélecteur (router.push), pas par un lien.
    const trigger = page.getByTestId("world-picker-trigger");
    await trigger.waitFor({ state: "visible", timeout: 20_000 });
    if (!(await trigger.textContent())?.includes(MONDE)) {
      await trigger.click();
      const item = page.getByTestId("world-picker-item").filter({ hasText: MONDE }).first();
      await expect(item, `« ${MONDE} » absent du sélecteur du compte de test`).toBeVisible({ timeout: 10_000 });
      const avant = page.url();
      await item.click();
      await page.waitForURL((u) => u.toString() !== avant, { timeout: 20_000 });
    }
    const monde = new URL(page.url()).pathname;
    expect(monde).toMatch(/^\/w\/[0-9a-f-]+$/);

    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));

    await page.goto(`${monde}?view=settings`);
    await page.locator('[role="tab"][id$="-trigger-announcements"]').click();

    const onglet = page.getByTestId("announcements-tab");
    await expect(onglet).toBeVisible();
    // Le compte revient de la base (« aucun destinataire » compris : le monde
    // de test n'a parfois que son propriétaire, qui ne se compte pas).
    await expect(page.getByTestId("announcement-recipient-count")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });

    // Les deux modes ; la notification demande un titre.
    await expect(page.getByTestId("announcement-kind-message")).toBeVisible();
    await page.getByTestId("announcement-kind-notification").click();
    await expect(page.getByTestId("announcement-kind-notification")).toHaveAttribute("aria-checked", "true");

    await page.getByTestId("announcement-title").fill("Essai {world}");
    await page.getByTestId("announcement-text").fill("Bonjour {username}, bienvenue dans {world}.");
    await page.getByTestId("announcement-preview-toggle").click();

    const apercu = page.getByTestId("announcement-preview");
    await expect(apercu).toContainText(`Essai ${MONDE}`);
    await expect(apercu).toContainText(`bienvenue dans ${MONDE}`);
    await expect(apercu).not.toContainText("{username}");
    // L'essai (migration 228) est prêt, sans être cliqué : il déposerait une
    // vraie notification chez le compte de test.
    await expect(page.getByTestId("announcement-test")).toBeEnabled();

    // L'historique se charge (vide ou non).
    await expect(page.getByTestId("announcements-empty").or(page.getByTestId("announcement-row").first())).toBeVisible({ timeout: 15_000 });
    expect(erreurs).toEqual([]);
  });
});
