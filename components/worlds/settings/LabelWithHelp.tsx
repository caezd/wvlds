"use client";

import * as React from "react";
import { HelpHint } from "@/components/ui/help-hint";

/** Libellé de réglage suivi de son aide (voir HelpHint). */
export function LabelWithHelp({
    children,
    help,
    title,
}: {
    children: React.ReactNode;
    help: string;
    /** Ce que l'aide explique, quand le libellé n'est pas un simple texte. */
    title?: string;
}) {
    return (
        <span className="flex items-center gap-1.5">
            {children}
            <HelpHint title={title ?? (typeof children === "string" ? children : undefined)}>{help}</HelpHint>
        </span>
    );
}
