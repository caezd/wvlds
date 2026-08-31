import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { ReactNode } from "react";

/**
 * Onglets en soulignement (trait actif = ombre `inset`) plutôt qu'en pastille
 * pleine (style par défaut de TabsTrigger, components/ui/tabs.tsx) — mêmes
 * primitives Radix directes et même technique que les onglets de paramètres
 * d'un monde (WorldSettingsView.tsx : voir son commentaire pour le détail).
 * Une ombre `inset` reste DANS la boîte du trigger, contrairement à un
 * `border`/une marge négative/un `transform`, qui gonfleraient tous la
 * hauteur mesurée par un ScrollArea englobant.
 *
 * On ne réutilise pas TabsTrigger (partagé par tout le reste de l'app, avec
 * son propre look "pastille") : on passe par les primitives Radix pour ce
 * seul usage, comme le fait déjà WorldSettingsView.tsx.
 */
export const TAB_BAR_TRIGGER_CLASS =
  "relative shrink-0 px-0.5 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_0_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export function TabBarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tab-bar-trigger"
      className={cn(TAB_BAR_TRIGGER_CLASS, className)}
      {...props}
    />
  );
}

/**
 * Barre d'onglets standardisée : liste Radix + ligne de base en soulignement.
 * Utiliser `action` pour un bouton/élément ancré à droite. Les enfants
 * doivent être des `TabBarTrigger` (pas le `TabsTrigger` partagé).
 *
 * La liste défile horizontalement (ScrollArea, comme WorldSettingsView.tsx)
 * plutôt que de simplement déborder : sur mobile, avec plusieurs sections,
 * une liste qui déborde sans défiler pousse `action` (« + Ajouter une
 * section ») hors du conteneur visible, sans moyen de l'atteindre. `action`
 * reste hors de la zone de défilement, donc toujours visible et accessible
 * quel que soit le nombre d'onglets.
 *
 * `sticky top-0` : les trois usages actuels vivent tous dans un panneau
 * défilant (drawer d'édition/aperçu de persona) sous un en-tête (bannière +
 * avatar) qui, lui, défile normalement — la barre reste donc accessible une
 * fois cet en-tête sorti du cadre, au lieu de disparaître avec lui. `bg-
 * background` est nécessaire pour rester opaque par-dessus le contenu qui
 * défile en dessous une fois épinglée.
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
  /** Classes appliquées à la liste d'onglets (ex: `flex-1 w-full` pour les étirer). */
  listClassName?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center gap-2 bg-background shadow-[inset_0_-1px_0_0_var(--color-border)]",
        action && "justify-between",
        className,
      )}
    >
      <ScrollArea className="min-w-0 flex-1">
        <TabsPrimitive.List className={cn("flex w-max items-center gap-6 px-6", listClassName)}>
          {children}
        </TabsPrimitive.List>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {action && <div className="shrink-0 pr-6">{action}</div>}
    </div>
  );
}
