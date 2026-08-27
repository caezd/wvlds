import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AbstractIntlMessages } from "next-intl";
import {
    ROUTE_SCOPED_NAMESPACES,
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

const FILES = [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "hooks")]
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

    it("chaque namespace de route n'est lu que sous sa propre route", () => {
        const routeOf: Record<string, string> = {
            admin: "app/(protected)/admin",
            settings: "app/(protected)/settings",
            shop: "app/(protected)/shop",
        };
        for (const ns of ROUTE_SCOPED_NAMESPACES) {
            const re = new RegExp(`useTranslations\\(\\s*["']${ns}["']`);
            const offenders = CLIENT_FILES
                .filter((f) => re.test(f.src))
                .map((f) => f.path.slice(ROOT.length + 1).replace(/\\/g, "/"))
                .filter((p) => !p.startsWith(routeOf[ns]));
            expect(offenders, `${ns} est lu hors de ${routeOf[ns]}`).toEqual([]);
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
