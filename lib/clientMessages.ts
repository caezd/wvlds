import type { AbstractIntlMessages } from "next-intl";

/**
 * Sélection des namespaces de traduction envoyés au navigateur.
 *
 * `app/(protected)/layout.tsx` sérialisait l'intégralité du catalogue dans le
 * flux RSC de **chaque** page protégée — 37 Ko de JSON (45 Ko de fichier), y
 * compris l'administration, la boutique ou les quêtes, sur une page de salon.
 *
 * Deux familles sont retirées du tronc commun, chacune vérifiée par relevé des
 * appels dans le code (aucun `useTranslations()` sans namespace, aucune clé
 * pointée traversant un namespace — les deux formes casseraient ce découpage) :
 *
 *  - `NOT_IN_SHELL_NAMESPACES` : rien, dans l'arbre protégé, ne les lit côté
 *    client (voir le détail sur la constante).
 *  - `ROUTE_SCOPED_NAMESPACES` : lus par des composants clients, mais d'une
 *    seule route. Chaque route concernée les remonte elle-même via un
 *    `NextIntlClientProvider` imbriqué dans son layout de segment
 *    (cf. withRouteMessages).
 *
 * Passer par les layouts de segment plutôt que par le pathname évite de
 * reconstruire la réponse du middleware, où les commentaires rappellent qu'une
 * `NextResponse.next()` neuve jette les cookies de session rafraîchis.
 */

/**
 * Retirés du tronc commun parce que rien, dans l'arbre protégé, ne les lit
 * côté client.
 *
 * `quests`, `changelog` et `offline` ne sont lus que par des Server Components
 * (`getTranslations`). `auth` est bien lu côté client — mais uniquement par les
 * formulaires de `app/auth/**`, qui vivent hors du groupe `(protected)` et ont
 * leur propre provider (cf. app/auth/layout.tsx).
 */
export const NOT_IN_SHELL_NAMESPACES = ["auth", "quests", "changelog", "offline"] as const;

/** Lus par des composants clients, mais d'une seule route chacun. */
export const ROUTE_SCOPED_NAMESPACES = [
    "admin",
    "settings",
    "shop",
    // Onglets secondaires d'un monde : wiki, carte, relations, catalogue. Ils
    // ne sont montés que par `WorldHome` (donc `/w/[id]`) et par les réglages
    // de monde — jamais depuis un salon, dont la barre latérale se contente du
    // namespace `worlds` pour ses liens de nav.
    "wiki",
    "map",
    "relations",
    "catalogue",
] as const;

/**
 * Namespaces remontés par `app/(protected)/w/[id]/layout.tsx`.
 *
 * Séparé de la liste ci-dessus parce que ces quatre-là partagent une même
 * route, là où `admin`/`settings`/`shop` ont chacune la leur.
 */
export const WORLD_ROUTE_NAMESPACES = ["wiki", "map", "relations", "catalogue"] as const;

const EXCLUDED_FROM_SHELL = new Set<string>([
    ...NOT_IN_SHELL_NAMESPACES,
    ...ROUTE_SCOPED_NAMESPACES,
]);

/**
 * Sélection explicite de namespaces, sans tronc commun.
 *
 * Pour les arbres qui vivent hors de `(protected)` et n'ont donc pas besoin de
 * la coque : `app/auth/**` n'utilise que `auth`, alors que son layout
 * sérialisait tout le catalogue — sur la toute première page qu'un visiteur
 * charge.
 */
export function pickMessages(
    all: AbstractIntlMessages,
    namespaces: readonly string[],
): AbstractIntlMessages {
    const out: AbstractIntlMessages = {};
    for (const ns of namespaces) {
        if (ns in all) out[ns] = all[ns];
    }
    return out;
}

/** Catalogue commun à toutes les pages protégées. */
export function shellMessages(all: AbstractIntlMessages): AbstractIntlMessages {
    const out: AbstractIntlMessages = {};
    for (const key of Object.keys(all)) {
        if (!EXCLUDED_FROM_SHELL.has(key)) out[key] = all[key];
    }
    return out;
}

/**
 * Catalogue commun **plus** les namespaces propres à une route, pour le
 * provider imbriqué de son layout de segment. Un namespace inconnu est ignoré
 * silencieusement : mieux vaut une clé manquante qu'un rendu qui casse.
 */
export function withRouteMessages(
    all: AbstractIntlMessages,
    namespaces: readonly string[],
): AbstractIntlMessages {
    const out = shellMessages(all);
    for (const ns of namespaces) {
        if (ns in all) out[ns] = all[ns];
    }
    return out;
}
