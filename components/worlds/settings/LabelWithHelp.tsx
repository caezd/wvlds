"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";

/** Libellé de réglage suivi d'un point d'interrogation qui porte l'explication. */
export function LabelWithHelp({
    children,
    help,
}: {
    children: React.ReactNode;
    help: string;
}) {
    return (
        <span className="flex items-center gap-1.5">
            {children}
            <HelpCircle
                className="h-3.5 w-3.5 text-muted-foreground/60"
                aria-label={help}
            />
        </span>
    );
}
