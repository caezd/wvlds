"use client";

import { useId, useState } from "react";
import { birthDateFromParts } from "@/lib/age";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpHint } from "@/components/ui/help-hint";

export type BirthDateLabels = { legend: string; day: string; month: string; year: string };

/**
 * Trois sélecteurs jour / mois / année. Remonte à chaque changement la date
 * AAAA-MM-JJ (null tant qu'elle est incomplète ou qu'elle n'existe pas) et si
 * les trois champs sont remplis. Les libellés viennent du parent : ce champ
 * sert sur la page d'inscription (namespace `auth`) comme dans les mondes.
 */
export function BirthDateFields({
  labels,
  onChange,
  error,
  hint,
  help,
  disabled,
}: {
  labels: BirthDateLabels;
  onChange: (birthDate: string | null, filled: boolean) => void;
  /** Message d'erreur sous les champs ; les sélecteurs passent en invalide. */
  error?: string | null;
  hint?: string;
  /** Une aide derrière un point d'interrogation, à côté du titre. */
  help?: { label: string; text: string };
  disabled?: boolean;
}) {
  const legendId = useId();
  const messageId = useId();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  function update(next: { d?: string; m?: string; y?: string }) {
    const d = next.d ?? day;
    const m = next.m ?? month;
    const y = next.y ?? year;
    setDay(d);
    setMonth(m);
    setYear(y);
    const filled = d !== "" && m !== "" && y !== "";
    onChange(filled ? birthDateFromParts(Number(y), Number(m), Number(d)) : null, filled);
  }

  const message = error || hint;
  const fields: { label: string; value: string; options: number[]; key: "d" | "m" | "y" }[] = [
    { label: labels.day, value: day, options: days, key: "d" },
    { label: labels.month, value: month, options: months, key: "m" },
    { label: labels.year, value: year, options: years, key: "y" },
  ];

  return (
    <fieldset className="space-y-1.5" aria-labelledby={legendId} aria-describedby={message ? messageId : undefined}>
      <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        <span id={legendId}>{labels.legend}</span>
        {help && <HelpHint label={help.label} align="start">{help.text}</HelpHint>}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {fields.map((f) => (
          <Select key={f.key} value={f.value} onValueChange={(v) => update({ [f.key]: v })} disabled={disabled}>
            <SelectTrigger aria-label={f.label} aria-invalid={!!error} className="w-full">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              {f.options.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      {message && (
        <p id={messageId} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {message}
        </p>
      )}
    </fieldset>
  );
}
