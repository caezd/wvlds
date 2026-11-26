"use client";

import { useEffect, useRef, useState } from "react";
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
import { useMyBirthDate } from "@/hooks/useMyBirthDate";
import { AgeVerificationFields } from "./AgeVerificationFields";

/**
 * La confirmation d'âge avant d'entrer dans un monde 18+, selon la date de
 * naissance du compte (migration 266) :
 *  - majeur connu : rien à demander, `onConfirm(null)` part dès l'ouverture ;
 *  - mineur connu : la fenêtre le dit, sans moyen de confirmer ;
 *  - sans date : elle est demandée ; `onConfirm` reçoit celle d'un majeur,
 *    que la base enregistre dans le compte.
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
  onConfirm: (birthDate: string | null) => void;
}) {
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const known = useMyBirthDate({ enabled: open });
  const [birthDate, setBirthDate] = useState<string | null>(null);

  // Réinitialise la saisie à chaque ouverture (les champs sont remontés).
  useEffect(() => {
    if (open) setBirthDate(null);
  }, [open]);

  // Majeur connu : une seule confirmation par ouverture.
  const autoConfirmed = useRef(false);
  useEffect(() => {
    if (!open) {
      autoConfirmed.current = false;
      return;
    }
    if (known.status === "adult" && !autoConfirmed.current) {
      autoConfirmed.current = true;
      onConfirm(null);
    }
  }, [open, known.status, onConfirm]);

  const shown = open && (known.status === "unknown" || known.status === "minor");
  const minor = known.status === "minor";

  return (
    <AlertDialog open={shown} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ageConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {minor ? t("ageRestrictedUnderage") : t("ageConfirmDescription", { name: worldName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {shown && !minor && <AgeVerificationFields onBirthDateChange={setBirthDate} />}

        <AlertDialogFooter>
          <AlertDialogCancel>{minor ? tCommon("close") : t("ageConfirmCancel")}</AlertDialogCancel>
          {!minor && (
            <AlertDialogAction
              disabled={!birthDate}
              onClick={(e) => {
                if (!birthDate) {
                  e.preventDefault();
                  return;
                }
                onConfirm(birthDate);
              }}
            >
              {t("ageConfirmContinue")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
