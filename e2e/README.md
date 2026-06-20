# Tests E2E (Playwright)

Tests de bout en bout qui pilotent un vrai navigateur contre l'app Next en cours d'exécution.

## Lancer les tests

```bash
pnpm test:e2e              # tous les tests (lance `pnpm dev` automatiquement)
pnpm test:e2e --ui         # mode interactif (debug visuel)
pnpm exec playwright show-report
```

Le serveur dev est démarré automatiquement par Playwright (`webServer` dans `playwright.config.ts`).
S'il tourne déjà sur le port 3000, il est réutilisé.

## Deux catégories

| Fichier                 | Auth requise | Tourne par défaut |
| ----------------------- | ------------ | ----------------- |
| `*.spec.ts` (smoke)     | non          | ✅ oui            |
| `*.authed.spec.ts`      | oui          | ⏭️ skip sans creds |

Les tests **smoke** (`smoke.spec.ts`) couvrent les pages publiques et la redirection des
routes protégées — aucun compte requis.

## Activer les tests authentifiés

1. Crée un compte de test dans ton instance Supabase (idéalement un projet/branche de test,
   pas la prod).
2. Renseigne ses identifiants via l'environnement (par ex. un fichier `.env.test.local`
   **non commité**, ou directement dans le shell) :

   ```bash
   E2E_EMAIL=test@exemple.com
   E2E_PASSWORD=motdepasse
   ```

3. Lance `pnpm test:e2e`. Le projet `setup` (`auth.setup.ts`) se connecte via l'UI et
   enregistre la session dans `e2e/.auth/user.json` ; les specs `*.authed.spec.ts` la
   réutilisent sans se reconnecter.

> ⚠️ `e2e/.auth/` contient des jetons de session — il est ignoré par git (voir `.gitignore`).

## Bonnes pratiques

- Vise des **parcours critiques** : connexion, création d'un monde, envoi d'un message,
  invitation. Pas besoin de tout couvrir en E2E — la logique fine est testée en unitaire (Vitest).
- Utilise des sélecteurs par **rôle/texte** (`getByRole`, `getByLabel`) plutôt que par classe CSS.
- Garde une **DB de test** isolée (branche Supabase) pour éviter de polluer la prod.
