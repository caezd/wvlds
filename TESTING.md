# Tests

Filet anti-régression pour l'app. Deux niveaux complémentaires :

| Niveau            | Outil                        | Couvre                                                        | Commande              |
| ----------------- | ---------------------------- | ------------------------------------------------------------ | --------------------- |
| Unitaire / compo  | **Vitest** + Testing Library | logique pure, server actions (Supabase mocké), composants    | `pnpm test`           |
| Bout en bout      | **Playwright**               | parcours réels dans un navigateur (auth, redirections, pages)| `pnpm test:e2e`       |

## Commandes

```bash
pnpm test            # tous les tests unitaires + composants (rapide, ~2 s)
pnpm test:watch      # mode watch pendant le dev
pnpm test:coverage   # rapport de couverture (coverage/index.html)
pnpm test:e2e        # tests E2E Playwright (démarre le serveur dev tout seul)
```

## Organisation

```
lib/__tests__/                  unités de logique pure + fonctions Supabase mockées
app/**/__tests__/               server actions (createClient mocké)
components/__tests__/            composants (rendu + interactions jsdom)
hooks/__tests__/                hooks temps réel (renderHook + canaux Realtime mockés)
test/supabaseMock.ts            helper : faux client Supabase chaînable + canaux Realtime
e2e/                            specs Playwright (voir e2e/README.md)
vitest.config.ts                config Vitest (jsdom, alias @/)
vitest.setup.ts                 setup global (matchMedia/ResizeObserver, cleanup)
```

## Couches testées

- **① Logique pure** — `dialogue-bubbles`, `chat-blocks` (dés), `crypto` (AES round-trip),
  `utils` (`isSafeUrl`, dates), `storage`, `changelog`. Aucun mock, déterministe.
- **② Couplé Supabase** — server actions (`chatrooms`, `worldMap`, `invite`, `personas`,
  `worldCatalog`, prefs monde, boutique), `userQuota`, `featureFlags`, `admin`. Le client
  Supabase est simulé via `test/supabaseMock.ts` (file de résultats consommée par `.from()`).
- **③ Composants & E2E** — composants à logique (`XPProgress`, `DateDisplay`, `HpBlock`,
  `CreateWorldButton`) en jsdom ; parcours réels (login, garde des routes protégées) en Playwright.
- **④ Temps réel & envoi de messages** — hooks `useCurrentUser`, `useRealtimeChatSync`
  (INSERT/UPDATE/DELETE/réactions), `usePresenceChannel` (présence, typing throttlé) via
  canaux Realtime mockés. Logique d'envoi extraite dans `lib/composerMessage.ts`
  (mentions, word count, métadonnées) et testée indépendamment du DOM.

### Refactors de support

Pour rendre testable la logique enfouie dans de gros composants, elle a été extraite
sans changement de comportement dans des modules purs réutilisés par le code de prod :
`lib/composerMessage.ts` (envoi), `lib/xp.ts` (`levelInfo`, partagé `XPProgress` ↔ éditeur
persona), `lib/persona-display.ts` (`initials`).

## Mocker Supabase dans une action

```ts
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const mock = createSupabaseMock({
  user: { id: "u1" },
  results: [{ data: { id: "x" }, error: null }], // un résultat par appel .from()
});
vi.mocked(createClient).mockResolvedValue(mock.client as never);
// ... puis asserter sur mock.buildersFor("table")[0].insert, etc.
```

## Étendre la couverture

Priorités quand tu ajoutes du code :

1. Toute **fonction pure** nouvelle dans `lib/` → un test unitaire (le moins cher, le plus rentable).
2. Toute **server action** → cas succès + cas erreur + garde d'auth.
3. Tout **composant avec de la logique** (calcul, validation, branches d'affichage) → un test de rendu.
4. Tout **parcours critique** (création monde, message, invitation) → une spec E2E.

> Les primitives UI (`components/ui/*`) et la data pure (`lib/lucideCategories.ts`) sont
> exclues de la couverture : peu de valeur à les tester.
