"use client";

import { useEffect } from "react";

/**
 * Dernier filet : erreur survenue dans le layout racine lui-même.
 *
 * Ce fichier remplace tout l'arbre, `<html>` et `<body>` compris — donc ni
 * providers, ni `NextIntlClientProvider`, ni même la feuille de style globale
 * (elle est importée par le layout qui vient d'échouer). D'où les styles en
 * ligne et le petit dictionnaire ci-dessous : tout ce dont dépend cet écran
 * doit tenir dans ce fichier, sans quoi il échouerait à son tour.
 *
 * La langue est déduite du navigateur plutôt que codée en dur : les traductions
 * habituelles sont hors d'atteinte, mais afficher un message français à un
 * compte anglophone resterait un défaut, fût-ce sur un écran de dernier
 * recours.
 */

const MESSAGES = {
    fr: {
        title: "Une erreur est survenue",
        description: "L’application n’a pas pu démarrer correctement. Rechargez la page pour réessayer.",
        retry: "Recharger",
    },
    en: {
        title: "Something went wrong",
        description: "The application failed to start. Reload the page to try again.",
        retry: "Reload",
    },
    es: {
        title: "Se ha producido un error",
        description: "La aplicación no ha podido iniciarse. Recargue la página para reintentar.",
        retry: "Recargar",
    },
} as const;

/**
 * Les jetons de :root (app/globals.css), recopiés : la feuille globale n'est
 * pas chargée ici, `var(--background)` ne vaudrait rien. À garder alignés.
 */
const TOKENS = {
    background: "oklch(0.223 0.004 285)", // design-allow : --background, CSS globale absente
    foreground: "oklch(0.93 0.012 285)", // design-allow : --foreground
    mutedForeground: "oklch(0.705 0.015 286)", // design-allow : --muted-foreground
    muted: "oklch(0.29 0.005 285)", // design-allow : --muted
    border: "oklch(0.274 0.006 285)", // design-allow : --border
    primary: "oklch(0.92 0.004 286.32)", // design-allow : --primary
    primaryForeground: "oklch(0.21 0.006 285.885)", // design-allow : --primary-foreground
} as const;

function pickLocale(): keyof typeof MESSAGES {
    if (typeof navigator === "undefined") return "fr";
    const tag = (navigator.language || "fr").slice(0, 2).toLowerCase();
    return tag === "en" || tag === "es" ? tag : "fr";
}

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Erreur fatale dans le layout racine :", error);
    }, [error]);

    const t = MESSAGES[pickLocale()];

    return (
        <html lang={pickLocale()}>
            <body
                style={{
                    margin: 0,
                    minHeight: "100dvh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.75rem",
                    padding: "1.5rem",
                    textAlign: "center",
                    // Couleurs figées (TOKENS) : les jetons de thème vivent dans
                    // la CSS globale, qui n'est pas chargée ici.
                    background: TOKENS.background,
                    color: TOKENS.foreground,
                    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                }}
            >
                <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>{t.title}</h1>
                <p style={{ fontSize: "0.875rem", color: TOKENS.mutedForeground, margin: 0, maxWidth: "28rem" }}>
                    {t.description}
                </p>
                {error.digest && (
                    <p style={{ fontSize: "0.7rem", color: TOKENS.mutedForeground, fontFamily: "monospace", margin: 0 }}>
                        {error.digest}
                    </p>
                )}
                <button
                    type="button"
                    onClick={reset}
                    // Le bouton principal (`Button` par défaut) recopié à la main :
                    // pilule claire, comme « Réessayer » de app/(protected)/error.tsx.
                    style={{
                        marginTop: "0.25rem",
                        cursor: "pointer",
                        borderRadius: "9999px",
                        border: "none",
                        background: TOKENS.primary,
                        color: TOKENS.primaryForeground,
                        height: "2.25rem",
                        padding: "0 1rem",
                        font: "inherit",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                    }}
                >
                    {t.retry}
                </button>
            </body>
        </html>
    );
}
