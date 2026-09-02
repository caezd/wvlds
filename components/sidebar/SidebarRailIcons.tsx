"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RailIcon({
  href,
  label,
  children,
  exact = false,
  badge = 0,
  badgeLabel,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  exact?: boolean;
  /** Nombre affiché en pastille. Zéro n'affiche rien. */
  badge?: number;
  /** Ce que la pastille signifie, pour qui ne la voit pas. Sans ça, un lecteur
   *  d'écran annonce un nombre nu — « Administration, 3 » ne veut rien dire. */
  badgeLabel?: string;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  // La pastille est une information, pas une décoration : elle doit passer par
  // le nom accessible du lien. L'infobulle ne suffirait pas — elle n'est
  // annoncée ni au clavier sur tous les lecteurs, ni jamais au toucher.
  const nomComplet = badge > 0 && badgeLabel ? `${label} — ${badgeLabel}` : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:text-mist-50 relative",
            isActive
              ? "bg-carbon-700 text-mist-50"
              : "text-mist-100",
          )}
          aria-label={nomComplet}
        >
          {isActive && (
            <span className="absolute w-[8px] h-[20px] bg-mist-50 -left-2 -translate-x-[6px] rounded-full" />
          )}
          {children}
          {badge > 0 && (
            // Même pastille que la cloche des notifications : deux compteurs
            // voisins sur le même rail, qui se liraient mal s'ils différaient.
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-0.5 text-[10px] font-bold text-accent-foreground shadow-[0_0_0_2px_hsl(var(--background))]">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {nomComplet}
      </TooltipContent>
    </Tooltip>
  );
}
