"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { DrawerClose, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/**
 * Coque des panneaux latéraux (drawers ancrés à droite).
 *
 * Treize écrans répétaient mot pour mot la même enveloppe : la classe de
 * `DrawerContent` (ancrage, bordure, ombre, `p-0`) et surtout le bouton de
 * fermeture, dont la classe fait 150 caractères — recopiée à l'identique
 * partout. Une correction de style demandait donc treize modifications, et rien
 * n'empêchait deux panneaux de diverger sans qu'on le remarque.
 *
 * Seule la largeur variait réellement. Elle reste explicite via `width`, avec
 * des classes littérales : Tailwind ne génère que ce qu'il lit tel quel dans les
 * sources, une largeur interpolée (`w-[...${n}px]`) ne produirait aucune règle.
 *
 * Le `DrawerHeader` reste chez l'appelant : plusieurs panneaux le veulent en
 * `sr-only`, d'autres avec une icône et des espacements propres — l'imposer ici
 * aurait remplacé une duplication par une prop fourre-tout.
 */

const BASE =
    "inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0";

/**
 * Largeurs utilisées, nommées par usage. `touch:` élargit au tactile, où le
 * drawer occupe une part bien plus grande de l'écran.
 */
export const SIDE_SHEET_WIDTHS = {
    /** Salon : réglages, épingles, statistiques. */
    chat: "w-[min(calc(100%_-_var(--drawer-inset)*2),_360px)] touch:w-[min(calc(100%_-_var(--drawer-inset)*2),_460px)]",
    /** Fiche de persona affichée depuis un salon. */
    persona: "w-[min(calc(100%_-_var(--drawer-inset)*2),_380px)] touch:w-[min(calc(100%_-_var(--drawer-inset)*2),_440px)]",
    /** Profil compact ouvert depuis un avatar. */
    compact: "w-[min(calc(100%_-_var(--drawer-inset)*2),_384px)]",
    /** Filtres de recherche. */
    filters: "w-[min(calc(100%_-_var(--drawer-inset)*2),_420px)]",
    /** Profil utilisateur complet. */
    profile: "w-[min(calc(100%_-_var(--drawer-inset)*2),_448px)]",
    /** Éditeurs et panneaux de contenu — le cas le plus courant. */
    wide: "w-[min(calc(100%_-_var(--drawer-inset)*2),_460px)]",
    /** Centre de recherche : résultats sur deux lignes, d'où plus de largeur. */
    search: "w-[min(calc(100%_-_var(--drawer-inset)*2),_520px)]",
} as const;

export type SideSheetWidth = keyof typeof SIDE_SHEET_WIDTHS;

export function SideSheetContent({
    width = "wide",
    className,
    closeClassName,
    children,
    hideClose = false,
}: {
    width?: SideSheetWidth;
    className?: string;
    /** Ajusté au cas par cas — `z-10` là où le panneau ouvre sur une bannière. */
    closeClassName?: string;
    children: React.ReactNode;
    /** Masque le bouton de fermeture — pour les panneaux qui se ferment au swipe. */
    hideClose?: boolean;
}) {
    const tCommon = useTranslations("common");

    return (
        <DrawerContent className={cn(BASE, SIDE_SHEET_WIDTHS[width], className)}>
            {!hideClose && (
                <DrawerClose
                    aria-label={tCommon("close")}
                    className={cn(
                        "absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring",
                        closeClassName,
                    )}
                >
                    <X className="size-4" />
                </DrawerClose>
            )}
            {children}
        </DrawerContent>
    );
}
