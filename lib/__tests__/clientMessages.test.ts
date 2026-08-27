import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AbstractIntlMessages } from "next-intl";
import {
    ROUTE_SCOPED_NAMESPACES,
    WORLD_ROUTE_NAMESPACES,
    SERVER_ONLY_NAMESPACES,
    shellMessages,
    withRouteMessages,
} from "@/lib/clientMessages";

const ROOT = process.cwd();
const fr = JSON.parse(readFileSync(join(ROOT, "messages/fr.json"), "utf8")) as AbstractIntlMessages;

/** Tous les fichiers source de l'app, hors tests. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) sourceFiles(full, acc);
        else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) acc.push(full);
    }
    return acc;
}

const FILES = [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "hooks"), join(ROOT, "lib")]
    .flatMap((d) => sourceFiles(d))
    .map((path) => ({ path, src: readFileSync(path, "utf8") }));

const CLIENT_FILES = FILES.filter((f) => /^["']use client["']/.test(f.src.replace(/^﻿/, "")));

function namespacesUsedIn(files: { src: string }[], call: "useTranslations" | "getTranslations") {
    const found = new Set<string>();
    const re = new RegExp(`${call}\\(\\s*["']([A-Za-z0-9_]+)["']`, "g");
    for (const { src } of files) {
        for (const m of src.matchAll(re)) found.add(m[1]);
    }
    return found;
}

describe("découpage des messages envoyés au client", () => {
    it("shellMessages retire exactement les namespaces exclus", () => {
        const shell = shellMessages(fr);
        for (const ns of [...SERVER_ONLY_NAMESPACES, ...ROUTE_SCOPED_NAMESPACES]) {
            expect(shell, `${ns} ne doit pas être dans le tronc commun`).not.toHaveProperty(ns);
        }
        const expected = Object.keys(fr).filter(
            (k) => ![...SERVER_ONLY_NAMESPACES, ...ROUTE_SCOPED_NAMESPACES].includes(k as never),
        );
        expect(Object.keys(shell).sort()).toEqual(expected.sort());
    });

    it("withRouteMessages rajoute le namespace de la route au tronc commun", () => {
        const msgs = withRouteMessages(fr, ["admin"]);
        expect(msgs).toHaveProperty("admin");
        expect(msgs.admin).toEqual(fr.admin);
        // …sans réintroduire les autres exclusions.
        expect(msgs).not.toHaveProperty("settings");
        expect(msgs).not.toHaveProperty("quests");
    });

    it("ignore un namespace inconnu plutôt que de produire une entrée vide", () => {
        const msgs = withRouteMessages(fr, ["nexistepas"]);
        expect(msgs).not.toHaveProperty("nexistepas");
    });

    // ── Garde-fous : c'est ce qui empêche une clé brute d'apparaître à l'écran ──

    // `app/auth/**` vit hors du groupe (protected) et possède son propre
    // NextIntlClientProvider, alimenté uniquement par le namespace `auth`
    // (cf. app/auth/layout.tsx). Ses formulaires sont donc hors du périmètre du
    // tronc commun — d'où cette liste, restreinte aux composants que seul cet
    // arbre monte.
    const AUTH_TREE_CLIENT_FILES = [
        "components/login-form.tsx",
        "components/forgot-password-form.tsx",
        "components/sign-up-form.tsx",
        "components/update-password-form.tsx",
    ];

    const PROTECTED_CLIENT_FILES = CLIENT_FILES.filter((f) => {
        const rel = f.path.slice(ROOT.length + 1).replace(/\\/g, "/");
        return !rel.startsWith("app/auth/") && !AUTH_TREE_CLIENT_FILES.includes(rel);
    });

    it("aucun namespace retiré n'est lu par un composant client de l'arbre protégé", () => {
        const usedByClients = namespacesUsedIn(PROTECTED_CLIENT_FILES, "useTranslations");
        for (const ns of SERVER_ONLY_NAMESPACES) {
            expect(
                usedByClients.has(ns),
                `${ns} est déclaré serveur-seul mais un composant client l'utilise`,
            ).toBe(false);
        }
    });

    it("l'arbre d'authentification ne lit que le namespace `auth`", () => {
        // app/auth/layout.tsx ne sérialise que `auth` : si un de ces formulaires
        // se met à lire un autre namespace, il faut l'ajouter là-bas.
        const authFiles = FILES.filter((f) => {
            const rel = f.path.slice(ROOT.length + 1).replace(/\\/g, "/");
            return rel.startsWith("app/auth/") || AUTH_TREE_CLIENT_FILES.includes(rel);
        });
        const used = new Set([
            ...namespacesUsedIn(authFiles, "useTranslations"),
            ...namespacesUsedIn(authFiles, "getTranslations"),
        ]);
        expect([...used].sort()).toEqual(["auth"]);
    });

    it("chaque namespace à route unique n'est lu que sous sa propre route", () => {
        // Les namespaces d'onglets de monde en sont exclus : ils partagent une
        // route et vivent dans components/worlds/**, donc un test par chemin ne
        // dirait rien d'utile. Ils sont couverts par le parcours d'imports.
        const routeOf: Record<string, string> = {
            admin: "app/(protected)/admin",
            settings: "app/(protected)/settings",
            shop: "app/(protected)/shop",
        };
        for (const ns of Object.keys(routeOf)) {
            const re = new RegExp(`useTranslations\\(\\s*["']${ns}["']`);
            const offenders = CLIENT_FILES
                .filter((f) => re.test(f.src))
                .map((f) => f.path.slice(ROOT.length + 1).replace(/\\/g, "/"))
                .filter((p) => !p.startsWith(routeOf[ns]));
            expect(offenders, `${ns} est lu hors de ${routeOf[ns]}`).toEqual([]);
        }
    });

    // ── Atteignabilité réelle, par parcours du graphe d'imports ──────────────
    //
    // Les namespaces d'onglets de monde (wiki, carte, relations, catalogue) ne
    // sont plus envoyés que sous /w/[id]. Un test par chemin de fichier ne
    // suffirait pas : ces composants vivent dans components/worlds/**, d'où
    // l'arbre du salon importe déjà des choses (CategoryAvatar, par exemple).
    // On suit donc les imports pour de bon, depuis les entrées de la route.

    const byPath = new Map(
        FILES.map((f) => [f.path.replace(/\\/g, "/"), f.src] as const),
    );

    /** Résout un specifier d'import vers un fichier du dépôt, si possible. */
    function resolveImport(fromPath: string, spec: string): string | null {
        let base: string;
        if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2)).replace(/\\/g, "/");
        else if (spec.startsWith(".")) base = join(fromPath, "..", spec).replace(/\\/g, "/");
        else return null; // dépendance externe
        for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
            if (byPath.has(cand)) return cand;
        }
        return null;
    }

    /** Tous les fichiers du dépôt atteignables depuis `entries`. */
    function reachableFrom(entries: string[]): Set<string> {
        const seen = new Set<string>();
        const queue = entries.map((e) => join(ROOT, e).replace(/\\/g, "/"));
        // `import x from "…"`, `import "…"` et `import("…")` dynamiques.
        const importRe = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;
        while (queue.length) {
            const path = queue.pop()!;
            if (seen.has(path)) continue;
            const src = byPath.get(path);
            if (src === undefined) continue;
            seen.add(path);
            for (const m of src.matchAll(importRe)) {
                const target = resolveImport(path, m[1]);
                if (target && !seen.has(target)) queue.push(target);
            }
        }
        return seen;
    }

    it("les namespaces d'onglets de monde sont inatteignables depuis une page de salon", () => {
        const reachable = reachableFrom([
            "app/(protected)/layout.tsx",
            "app/(protected)/c/[id]/layout.tsx",
            "app/(protected)/c/[id]/page.tsx",
        ]);
        // Garde-fou du garde-fou : si le parcours ne trouve presque rien, c'est
        // la résolution qui est cassée, pas le code — un test vert ne voudrait
        // alors plus rien dire.
        expect(reachable.size).toBeGreaterThan(50);

        const offenders: string[] = [];
        for (const ns of WORLD_ROUTE_NAMESPACES) {
            const re = new RegExp(`useTranslations\\(\\s*["']${ns}["']`);
            for (const path of reachable) {
                if (re.test(byPath.get(path) ?? "")) {
                    offenders.push(`${ns} ← ${path.slice(ROOT.length + 1)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("les namespaces d'onglets de monde restent atteignables depuis une page de monde", () => {
        // Le pendant du test précédent : sans lui, retirer un namespace du
        // tronc commun sans que personne ne le lise passerait pour un succès.
        const reachable = reachableFrom([
            "app/(protected)/layout.tsx",
            "app/(protected)/w/[id]/layout.tsx",
            "app/(protected)/w/[id]/page.tsx",
        ]);
        for (const ns of WORLD_ROUTE_NAMESPACES) {
            const re = new RegExp(`useTranslations\\(\\s*["']${ns}["']`);
            const used = [...reachable].some((p) => re.test(byPath.get(p) ?? ""));
            expect(used, `${ns} n'est lu par aucun composant de /w — namespace mort ?`).toBe(true);
        }
    });

    it("aucun composant client n'appelle useTranslations() sans namespace", () => {
        // Ce motif contournerait le découpage : le composant lirait n'importe
        // quelle clé, y compris celles qui ne sont plus envoyées.
        const offenders = CLIENT_FILES
            .filter((f) => /useTranslations\(\s*\)/.test(f.src))
            .map((f) => f.path.slice(ROOT.length + 1));
        expect(offenders).toEqual([]);
    });

    it("aucun namespace du tronc commun n'est mort", () => {
        // Le test suivant vérifie qu'un namespace n'est pas *oublié* du
        // découpage ; celui-ci vérifie l'inverse — qu'on n'envoie pas à tout le
        // monde des traductions que plus personne ne lit. `home` (849 o, en
        // trois langues) était dans ce cas : son unique lecteur,
        // CreateWorldButton, n'était plus monté nulle part.
        const clientRead = namespacesUsedIn(FILES, "useTranslations");
        const serverRead = namespacesUsedIn(FILES, "getTranslations");
        const dead = Object.keys(shellMessages(fr)).filter(
            (ns) => !clientRead.has(ns) && !serverRead.has(ns),
        );
        expect(dead, "namespaces envoyés au navigateur mais jamais lus").toEqual([]);
    });

    it("tout namespace du catalogue est soit envoyé, soit lu côté serveur", () => {
        // Détecte un namespace ajouté au JSON puis oublié dans le découpage.
        const shell = new Set(Object.keys(shellMessages(fr)));
        const serverUsed = namespacesUsedIn(FILES, "getTranslations");
        const orphans = Object.keys(fr).filter(
            (ns) =>
                !shell.has(ns) &&
                !ROUTE_SCOPED_NAMESPACES.includes(ns as never) &&
                !serverUsed.has(ns),
        );
        expect(orphans).toEqual([]);
    });
});
