"use client";

import { memo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** La valeur « aucun fuseau » — un `Select` Radix refuse la chaîne vide. */
export const TIMEZONE_NONE = "__none__";

/**
 * Le choix du fuseau, à part et mémoïsé.
 *
 * Radix rend les options d'un `Select` même fermé (il en tire le libellé
 * affiché) : les quelque quatre cents fuseaux se re-rendaient à chaque lettre
 * tapée dans la présentation ou les disponibilités. Isolé, il ne bouge que
 * lorsque le fuseau change.
 */
export const TimezoneSelect = memo(function TimezoneSelect({
  value,
  onChange,
  timezones,
  label,
  noneLabel,
}: {
  value: string;
  onChange: (tz: string) => void;
  timezones: string[];
  label: string;
  noneLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="min-w-0 flex-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={TIMEZONE_NONE}>{noneLabel}</SelectItem>
        {timezones.map((tz) => (
          <SelectItem key={tz} value={tz}>
            {tz.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
