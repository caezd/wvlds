import { test, expect } from "@playwright/test";

// Onglet « Annonces » des réglages d'un monde (migrations 227 à 230).
//
// Le compte de test possède « Monde E2E » : il y a donc la permission
// `members.announce`. Le test monte l'onglet en vrai (providers, next-intl,
// RPC de comptage et d'historique) et va jusqu'à l'aperçu, SANS envoyer : un
// envoi écrirait des messages privés ou des notifications réels.
//
// Rien n'y dépend de la langue du compte : sélecteurs par identifiant de test,
// et la section ouverte par l'adresse (`&section=announcements`).

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

    await page.goto(`${monde}?view=settings&section=announcements`);

    // Le rendu en flux laisse un instant, dans un <div hidden> du body, la
    // copie serveur de la section avant que React ne la mette en place :
    // seule la copie visible compte.
    const onglet = page.getByTestId("announcements-tab").filter({ visible: true });
    await expect(onglet).toBeVisible();
    // Le compte revient de la base (« aucun destinataire » compris : le monde
    // de test n'a parfois que son propriétaire, qui ne se compte pas).
    await expect(page.getByTestId("announcement-recipient-count")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });

    // Les deux modes ; la notification demande un titre.
    await expect(page.getByTestId("announcement-kind-message")).toBeVisible();
    await page.getByTestId("announcement-kind-notification").click();
    await expect(page.getByTestId("announcement-kind-notification")).toHaveAttribute("aria-checked", "true");

    // Filtres (migration 229) : le compte se refait avec eux.
    await page.getByTestId("announcement-filters-toggle").click();
    await expect(page.getByTestId("announcement-filters")).toBeVisible();
    await page.locator('[data-testid="announcement-filter-inactive"][data-days="30"]').click();
    await expect(page.locator('[data-testid="announcement-filter-inactive"][data-days="30"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("announcement-recipient-count")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });

    await page.getByTestId("announcement-title").fill("Essai {world}");
    await page.getByTestId("announcement-text").fill("Bonjour {username}, bienvenue dans {world}.");
    // L'aperçu s'ouvre dans une fenêtre.
    await page.getByTestId("announcement-preview-open").click();
    const fenetre = page.getByTestId("announcement-preview-dialog");
    const apercu = fenetre.getByTestId("announcement-preview");
    await expect(apercu).toContainText(`Essai ${MONDE}`);
    await expect(apercu).toContainText(`bienvenue dans ${MONDE}`);
    await expect(apercu).not.toContainText("{username}");
    await page.keyboard.press("Escape");
    await expect(fenetre).toBeHidden();
    // L'essai (migration 228) est prêt, sans être cliqué : il déposerait une
    // vraie notification chez le compte de test.
    await expect(page.getByTestId("announcement-test")).toBeEnabled();

    // Bandeau et signature du monde (migration 230) : le titre reste, la
    // durée et la signature apparaissent ; l'aperçu montre le bandeau.
    await page.getByTestId("announcement-kind-banner").click();
    await expect(page.getByTestId("announcement-kind-banner")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("announcement-preview-open").click();
    await expect(fenetre.getByTestId("announcement-preview-banner")).toContainText(`Essai ${MONDE}`);
    await page.keyboard.press("Escape");
    await expect(fenetre).toBeHidden();
    await page.locator('[data-testid="banner-days"][data-days="7"]').click();
    await expect(page.locator('[data-testid="banner-days"][data-days="7"]')).toHaveAttribute("aria-pressed", "true");
    await expect(onglet.getByRole("switch").first()).toBeEnabled();

    // La programmation propose une date à venir, sans être confirmée ici.
    await page.getByTestId("announcement-schedule").click();
    const programmer = page.getByTestId("announcement-schedule-dialog");
    await expect(programmer).toBeVisible();
    await expect(programmer.getByTestId("announcement-schedule-confirm")).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(programmer).toBeHidden();

    // L'historique se charge (vide ou non).
    await expect(page.getByTestId("announcements-empty").or(page.getByTestId("announcement-row").first())).toBeVisible({ timeout: 15_000 });
    // Le message de bienvenue a sa page, dans Communications ; il se
    // charge, sans être enregistré ici.
    await expect(page.getByTestId("welcome-section")).toHaveCount(0);
    await page.getByTestId("settings-nav").filter({ visible: true }).locator('[data-section="welcome"]').click();
    await expect(page).toHaveURL(/section=welcome/);
    const bienvenue = page.getByTestId("welcome-section").filter({ visible: true });
    await expect(bienvenue).toBeVisible();
    await expect(bienvenue.getByRole("switch")).toBeEnabled({ timeout: 15_000 });
    expect(erreurs).toEqual([]);
  });
});
