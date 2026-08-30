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
                    // Couleurs figées : les jetons de thème vivent dans la CSS
                    // globale, qui n'est pas chargée ici.
                    background: "#1B1B1D",
                    color: "#E9E9EA",
                    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                }}
            >
                <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>{t.title}</h1>
                <p style={{ fontSize: "0.875rem", color: "#9A9AA0", margin: 0, maxWidth: "28rem" }}>
                    {t.description}
                </p>
                {error.digest && (
                    <p style={{ fontSize: "0.7rem", color: "#6B6B72", fontFamily: "monospace", margin: 0 }}>
                        {error.digest}
                    </p>
                )}
                <button
                    type="button"
                    onClick={reset}
                    style={{
                        marginTop: "0.25rem",
                        cursor: "pointer",
                        borderRadius: "0.5rem",
                        border: "1px solid #3A3A40",
                        background: "#232326",
                        color: "inherit",
                        padding: "0.5rem 1rem",
                        font: "inherit",
                        fontSize: "0.875rem",
                    }}
                >
                    {t.retry}
                </button>
            </body>
        </html>
    );
}
