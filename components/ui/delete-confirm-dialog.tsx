"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";

/**
 * Confirmation de suppression, partagée par dix-huit écrans.
 *
 * Les quatre libellés étaient des valeurs par défaut EN FRANÇAIS. Dix appels
 * s'en remettent au titre et aux deux boutons : une personne lisant
 * l'application en anglais ou en espagnol voyait « Confirmer la suppression »,
 * « Annuler », « Supprimer ». Le repli est désormais traduit.
 */
export function DeleteConfirmDialog({
  trigger,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Mode contrôlé : passe open + onOpenChange sans trigger. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const t = useTranslations("common");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t("deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? t("irreversible")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel ?? t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmLabel ?? t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
