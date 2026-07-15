"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { isAdult } from "@/lib/age";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Trois sélecteurs jour / mois / année pour saisir une date de naissance.
 * Remonte au parent, à chaque changement, si la date saisie correspond à un
 * majeur (>= 18 ans). La date elle-même n'est jamais stockée : elle sert
 * uniquement à porter la case « je confirme » côté client.
 */
export function AgeVerificationFields({
  onAdultChange,
  disabled,
}: {
  onAdultChange: (adult: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("explore");
  const labelId = useId();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const filled = day !== "" && month !== "" && year !== "";
  const adult = filled && isAdult(Number(year), Number(month), Number(day));
  const showError = filled && !adult;

  function update(next: { d?: string; m?: string; y?: string }) {
    const d = next.d ?? day;
    const m = next.m ?? month;
    const y = next.y ?? year;
    if (next.d !== undefined) setDay(next.d);
    if (next.m !== undefined) setMonth(next.m);
    if (next.y !== undefined) setYear(next.y);
    const isFilled = d !== "" && m !== "" && y !== "";
    onAdultChange(isFilled && isAdult(Number(y), Number(m), Number(d)));
  }

  const triggerClass = "w-full";

  return (
    <div className="space-y-1.5">
      <span id={labelId} className="text-sm font-medium">
        {t("ageConfirmBirthDate")}
      </span>
      <div className="grid grid-cols-3 gap-2">
        <Select value={day} onValueChange={(v) => update({ d: v })} disabled={disabled}>
          <SelectTrigger
            aria-label={t("ageConfirmDay")}
            aria-invalid={showError}
            className={triggerClass}
          >
            <SelectValue placeholder={t("ageConfirmDay")} />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d} value={String(d)}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={month} onValueChange={(v) => update({ m: v })} disabled={disabled}>
          <SelectTrigger
            aria-label={t("ageConfirmMonth")}
            aria-invalid={showError}
            className={triggerClass}
          >
            <SelectValue placeholder={t("ageConfirmMonth")} />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={String(m)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={(v) => update({ y: v })} disabled={disabled}>
          <SelectTrigger
            aria-label={t("ageConfirmYear")}
            aria-invalid={showError}
            className={triggerClass}
          >
            <SelectValue placeholder={t("ageConfirmYear")} />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className={cn("text-xs text-destructive", showError ? "block" : "hidden")}>
        {t("ageConfirmUnderage")}
      </p>
    </div>
  );
}
