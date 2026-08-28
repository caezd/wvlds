"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Frontière d'erreur des pages protégées.
 *
 * Sans elle, la moindre erreur non rattrapée — dans un Server Component, un
 * chargement de données, un rendu — remontait jusqu'au traitement par défaut de
 * Next : un écran nu, sans marque, sans issue autre que recharger la page à la
 * main. Ici l'utilisateur reste dans l'application (le layout protégé, donc la
 * navigation, est toujours rendu au-dessus de cette frontière) et dispose de
 * deux sorties : réessayer le rendu, ou revenir à l'accueil.
 *
 * `reset()` retente le rendu du segment sans rechargement complet : suffisant
 * pour une erreur passagère (réseau, requête qui a échoué une fois).
 */
export default function ProtectedError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations("errorBoundary");

    useEffect(() => {
        // Seul endroit où l'erreur reste observable : Next ne journalise que le
        // `digest` côté serveur, le message d'origine n'atteint jamais les logs
        // applicatifs sans ça.
        console.error("Erreur non rattrapée dans une page protégée :", error);
    }, [error]);

    return (
        // `data-testid` : repère stable pour le parcours de routes E2E, qui
        // vérifie qu'aucune page connectée ne retombe sur cette frontière. Le
        // texte est traduit, donc inutilisable comme sélecteur.
        <div
            data-testid="error-boundary"
            className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        >
            <AlertTriangle className="size-10 text-muted-foreground" />
            <div className="max-w-md space-y-1">
                <h1 className="text-lg font-semibold">{t("title")}</h1>
                <p className="text-sm text-muted-foreground">{t("description")}</p>
                {error.digest && (
                    // Permet de relier un rapport d'utilisateur aux logs serveur.
                    <p className="pt-1 font-mono text-[0.7rem] text-muted-foreground/60">{error.digest}</p>
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button onClick={reset}>{t("retry")}</Button>
                <Button variant="outline" asChild>
                    <Link href="/">{t("home")}</Link>
                </Button>
            </div>
        </div>
    );
}
