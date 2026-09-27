"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/ui/help-hint";

/**
 * Une fonction du monde, dans ses réglages : son nom, son aide et son
 * interrupteur sur une ligne (précédés d'une icône si on en donne une). Ses
 * options dépendantes se déplient dessous quand elle est active, en retrait
 * le long d'un fil. `action` se place avant l'interrupteur.
 */
export function FeatureRow({
  icon: Icon,
  label,
  help,
  checked,
  disabled,
  onCheckedChange,
  action,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3" data-testid="feature-row">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
          {label}
          <HelpHint title={label}>{help}</HelpHint>
        </p>
        {action}
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={label}
          className="shrink-0"
        />
      </div>
      {checked && children && (
        <div className="ml-1 mt-3 space-y-3 border-l border-border-soft pl-4" data-testid="feature-options">
          {children}
        </div>
      )}
    </div>
  );
}

/** Une option dépendante d'une fonction : son nom, son aide, son contrôle à droite. */
export function FeatureOption({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help?: string;
  className?: string;
  /** Le contrôle : interrupteur, champ, bouton. */
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-4", className)}>
      <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {help && <HelpHint title={label}>{help}</HelpHint>}
      </p>
      {children}
    </div>
  );
}
