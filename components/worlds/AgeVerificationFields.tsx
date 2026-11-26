"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isAdultIso } from "@/lib/age";
import { BirthDateFields } from "@/components/BirthDateFields";

/**
 * La date de naissance demandée à l'entrée d'un monde 18+. Remonte au parent
 * si elle correspond à un majeur et, le cas échéant, la date elle-même
 * (AAAA-MM-JJ), que la confirmation enregistre dans le compte (migration 266).
 */
export function AgeVerificationFields({
  onAdultChange,
  onBirthDateChange,
  disabled,
}: {
  onAdultChange?: (adult: boolean) => void;
  /** La date saisie quand elle est celle d'un majeur, sinon null. */
  onBirthDateChange?: (birthDate: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("explore");
  const [showError, setShowError] = useState(false);

  return (
    <BirthDateFields
      labels={{
        legend: t("ageConfirmBirthDate"),
        day: t("ageConfirmDay"),
        month: t("ageConfirmMonth"),
        year: t("ageConfirmYear"),
      }}
      disabled={disabled}
      error={showError ? t("ageConfirmUnderage") : null}
      hint={t("ageConfirmSaved")}
      onChange={(birthDate, filled) => {
        const adult = birthDate !== null && isAdultIso(birthDate);
        setShowError(filled && !adult);
        onAdultChange?.(adult);
        onBirthDateChange?.(adult ? birthDate : null);
      }}
    />
  );
}
