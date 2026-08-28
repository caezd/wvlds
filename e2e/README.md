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

### Contre un build de production — plus rapide et plus fiable

`next dev` compile à la demande, dans un seul processus : plusieurs workers en
parallèle le mettent en défaut et des routes prises au hasard répondent 500.
La suite tourne donc avec **un seul worker** quand Playwright démarre lui-même
`pnpm dev`.

Sur un serveur bâti, le parallélisme est sûr — et la suite passe de 1 min 30 à
**21 secondes** :

```bash
pnpm build
pnpm start -- -p 3100                       # dans un autre terminal
E2E_BASE_URL=http://localhost:3100 pnpm test:e2e
```

Renseigner `E2E_BASE_URL` désactive le démarrage automatique du serveur dev et
rétablit le parallélisme. C'est le mode à privilégier en intégration continue :
c'est aussi ce que voient les utilisateurs.

## Deux catégories

| Fichier                 | Auth requise | Tourne par défaut |
| ----------------------- | ------------ | ----------------- |
| `*.spec.ts` (smoke)     | non          | ✅ oui            |
| `*.authed.spec.ts`      | oui          | ⏭️ skip sans creds |

Les tests **smoke** (`smoke.spec.ts`) couvrent les pages publiques et la redirection des
routes protégées — aucun compte requis.

`routes.authed.spec.ts` balaie **toutes** les routes connectées et vérifie
seulement qu'elles rendent : statut < 400, aucune exception, pas de frontière
d'erreur, page non vide. Il existe parce qu'une modification des providers du
layout racine a mis toute l'application en 500 le 2026-08-28 sans qu'aucun test
unitaire ne puisse le voir — ils remplacent next-intl par un mock, donc le
contexte manquant n'existe pas pour eux.

> ⚠️ Un test **sauté** est un trou silencieux. La découverte des données du
> compte de test vit dans `decouverte.ts` et parcourt les mondes jusqu'à trouver
> un salon, plutôt que de se rabattre sur `test.skip()`.

## Activer les tests authentifiés

1. Crée un compte de test dans ton instance Supabase (idéalement un projet/branche de test,
   pas la prod).
2. Renseigne ses identifiants dans **`.env.local`** (non commité) :

   ```bash
   E2E_EMAIL=test@exemple.com
   E2E_PASSWORD=motdepasse
   ```

   C'est bien `.env.local` : `playwright.config.ts` charge ce fichier-là via
   dotenv. Playwright ne lit aucun `.env` de lui-même — placés ailleurs, ces
   identifiants restent invisibles et **toutes les specs authentifiées sont
   ignorées en silence**, ce qui donne une suite verte n'ayant rien vérifié.

3. Lance `pnpm test:e2e`. Le projet `setup` (`auth.setup.ts`) se connecte via l'UI et
   enregistre la session dans `e2e/.auth/user.json` ; les specs `*.authed.spec.ts` la
   réutilisent sans se reconnecter.

> ⚠️ `e2e/.auth/` contient des jetons de session — il est ignoré par git (voir `.gitignore`).

## Bonnes pratiques

- Vise des **parcours critiques** : connexion, création d'un monde, envoi d'un message,
  invitation. Pas besoin de tout couvrir en E2E — la logique fine est testée en unitaire (Vitest).
- Utilise des sélecteurs par **rôle/texte** (`getByRole`, `getByLabel`) plutôt que par classe CSS.
- Garde une **DB de test** isolée (branche Supabase) pour éviter de polluer la prod.
