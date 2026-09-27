"use client";

import * as React from "react";
import { HelpHint } from "@/components/ui/help-hint";

/** Libellé de réglage suivi de son aide (voir HelpHint). */
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
            <HelpHint title={typeof children === "string" ? children : undefined}>{help}</HelpHint>
        </span>
    );
}
