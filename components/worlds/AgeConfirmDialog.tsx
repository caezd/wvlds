"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AgeVerificationFields } from "./AgeVerificationFields";

/**
 * Dialog de confirmation d'âge : l'utilisateur choisit sa date de naissance ;
 * le bouton de confirmation ne s'active que si elle correspond à un majeur.
 * `onConfirm` n'est appelé qu'avec une date valide (>= 18 ans).
 */
export function AgeConfirmDialog({
  worldName,
  open,
  onOpenChange,
  onConfirm,
}: {
  worldName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("explore");
  const [adult, setAdult] = useState(false);

  // Réinitialise la validité à chaque ouverture (les champs sont remontés).
  useEffect(() => {
    if (open) setAdult(false);
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ageConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ageConfirmDescription", { name: worldName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {open && <AgeVerificationFields onAdultChange={setAdult} />}

        <AlertDialogFooter>
          <AlertDialogCancel>{t("ageConfirmCancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!adult}
            onClick={(e) => {
              if (!adult) {
                e.preventDefault();
                return;
              }
              onConfirm();
            }}
          >
            {t("ageConfirmContinue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
