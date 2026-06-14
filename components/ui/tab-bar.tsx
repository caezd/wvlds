import { cn } from "@/lib/utils";
import { TabsList } from "@/components/ui/tabs";
import type { ReactNode } from "react";

/**
 * Barre d'onglets standardisée : TabsList + bordure inférieure.
 * Utiliser `action` pour un bouton/élément ancré à droite.
 */
export function TabBar({
  children,
  action,
  className,
  listClassName,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Classes appliquées au TabsList (ex: `flex-1 w-full` pour étirer les onglets). */
  listClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border-soft px-6 pb-3",
        action && "justify-between",
        className,
      )}
    >
      <TabsList className={listClassName}>{children}</TabsList>
      {action}
    </div>
  );
}
