import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * L'intitulé d'une section : petites capitales espacées, 10 px, gris
 * secondaire. Un seul style pour « RÉCENTS », « GROUPE », « STATUT »…
 */
export function SectionLabel({
  as: Tag = "h3",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "h2" | "h3" | "h4" | "p" | "span" | "div" | "legend" | "dt" }) {
  return (
    <Tag
      className={cn("text-2xs font-semibold uppercase tracking-wider text-muted-foreground", className)}
      {...props}
    />
  );
}
