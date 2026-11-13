"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

import { getInitials } from "@/lib/textFormatting";
import { Input } from "@/components/ui/input";
import { NO_GROUP_RING } from "./PersonaNode";
import type { CPersona } from "./types";
import { withOpacity } from "@/lib/colorOpacity";

/** Nombre de résultats proposés sous le champ. */
const MAX_RESULTS = 6;

/**
 * La recherche de l'en-tête, toujours visible : elle filtre la liste mobile
 * et estompe le canevas ; sur grand écran, elle propose aussi les personas
 * qui correspondent. Entrée ouvre le premier, Échap vide le champ.
 */
export function RelationsSearch({
  value,
  onChange,
  results,
  handleOf,
  groupColorOf,
  onOpen,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Les personas qui correspondent, dans l'ordre. */
  results: CPersona[];
  handleOf: (userId: string) => string;
  groupColorOf: (personaId: string) => string | undefined;
  onOpen: (personaId: string) => void;
}) {
  const t = useTranslations("relations");
  const shown = value.trim() ? results.slice(0, MAX_RESULTS) : [];

  return (
    <div className="relative w-36 sm:w-[220px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
          if (e.key === "Enter" && shown[0]) onOpen(shown[0].id);
        }}
        placeholder={t("searchPersonaOrPlayer")}
        aria-label={t("searchPersonaOrPlayer")}
        className="pl-8 pr-7"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("clearSearch")}
          className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {shown.length > 0 && (
        <div role="listbox" aria-label={t("searchPersonaOrPlayer")} className="absolute inset-x-0 top-[42px] z-floating hidden flex-col rounded-lg border bg-popover p-1 shadow-floating lg:flex">
          {shown.map((p) => {
            const color = groupColorOf(p.id);
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onOpen(p.id)}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <span
                  className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full text-2xs font-semibold"
                  style={{ background: color ? withOpacity(color, 0.2) : "var(--muted)", boxShadow: `inset 0 0 0 1.5px ${color ?? NO_GROUP_RING}` }}
                >
                  {p.avatar_url ? <Image src={p.avatar_url} alt="" fill sizes="24px" className="object-cover" /> : getInitials(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs-plus text-muted-foreground">{handleOf(p.user_id)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
