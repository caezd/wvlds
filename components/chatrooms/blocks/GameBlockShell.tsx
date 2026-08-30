"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * Primitives universelles partagées par tous les blocs de jeu d'un message.
 *
 * - `GameBlockSurface` : la « carte » d'un bloc (bordure, fond, padding, arrondi).
 *   Modifier l'apparence des blocs de type carte se fait ici, en un seul endroit.
 * - `GameBlockToolbar` : la barre d'outils éditer / supprimer révélée au survol.
 * - `GameBlockEditButton` : le bouton crayon standard à passer comme `trigger`
 *   au dialog d'édition propre à chaque bloc.
 *
 * Convention de survol : la racine d'un bloc déclare le groupe `group/gblock`
 * (c'est le cas de `GameBlockSurface`) et la barre d'outils se révèle via
 * `group-hover/gblock`. Les blocs à mise en page particulière (scène, ellipse,
 * révélation…) gardent leur racine propre mais doivent y déclarer `group/gblock`
 * pour profiter de la barre d'outils.
 */

export function GameBlockSurface({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/gblock relative w-full rounded-xl py-3",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Bouton d'édition standard, à passer comme `trigger` au dialog d'un bloc.
 *
 * Il propage toutes les props reçues (`onClick`, `ref`, `data-state`…) au Button
 * sous-jacent : indispensable car Radix (`DialogTrigger asChild`) clone ce bouton
 * pour y injecter le gestionnaire d'ouverture. Sans cette propagation, le clic
 * n'atteindrait jamais le `<button>` et le dialog ne s'ouvrirait pas.
 */
export function GameBlockEditButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const t = useTranslations("chatrooms");
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("h-6 w-6", className)}
      aria-label={t("blockEdit")}
      {...props}
    >
      <Pencil className="h-3 w-3" />
    </Button>
  );
}

export function GameBlockToolbar({
  mine,
  editDialog,
  onDelete,
  deleteDescription,
  className,
}: {
  mine: boolean;
  /** Le dialog d'édition propre au bloc, déjà câblé avec `<GameBlockEditButton />`. */
  editDialog?: React.ReactNode;
  onDelete?: () => void;
  deleteDescription?: string;
  /** Positionnement de la barre dans le bloc (ex. "shrink-0", "mt-2 justify-center"). */
  className?: string;
}) {
  const t = useTranslations("chatrooms");
  if (!mine || (!editDialog && !onDelete)) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 transition-opacity group-hover/gblock:opacity-100 focus-within:opacity-100",
        className,
      )}
    >
      {editDialog}
      {onDelete && (
        <DeleteConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-destructive hover:text-destructive"
              aria-label={t("blockDelete")}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          }
          description={deleteDescription ?? t("blockDeleteDescription")}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}
