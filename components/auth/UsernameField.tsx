"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { USERNAME_MAX } from "@/lib/username";
import type { UsernameAvailability } from "@/hooks/useUsernameAvailability";

/**
 * Le champ du pseudo, avec son état en direct sous la saisie : format, puis
 * disponibilité (`useUsernameAvailability`, que le parent appelle pour savoir
 * s'il peut envoyer). Monté par la page d'inscription et par la fenêtre
 * « Choisissez votre pseudo » : il lit le namespace `auth`.
 */
export function UsernameField({
  value,
  onChange,
  availability,
  id,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  availability: UsernameAvailability;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("auth");
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const statusId = `${inputId}-status`;

  const bad = availability.status === "invalid" || availability.status === "taken";
  const message =
    availability.status === "idle"
      ? t("username.hint")
      : availability.status === "invalid"
        ? t(`username.${availability.problem}`)
        : t(`username.${availability.status}`);

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={inputId}>{t("username.label")}</Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("username.placeholder")}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={USERNAME_MAX + 8}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={bad}
        aria-describedby={statusId}
      />
      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          "-mt-1 flex min-h-4 items-center gap-1.5 text-xs",
          bad ? "text-destructive" : availability.status === "available" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {availability.status === "checking" && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />}
        {availability.status === "available" && <Check className="size-3.5 shrink-0" aria-hidden />}
        {bad && <X className="size-3.5 shrink-0" aria-hidden />}
        <span>{message}</span>
      </p>
    </div>
  );
}
