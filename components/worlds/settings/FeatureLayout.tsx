"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/ui/help-hint";

/**
 * La mise en page des réglages de fonctions (onglet Fonctions) : une page
 * par catégorie, faite de sections à deux colonnes — titre à gauche,
 * réglages à droite —, avec des listes d'interrupteurs bordées. Pas de
 * description sous les titres : l'explication est derrière l'aide (voir
 * HelpHint), à côté du titre.
 *
 * La page est un conteneur (`@container`) : ses sections passent en deux
 * colonnes selon la place qu'elle a, pas selon la fenêtre — entre les
 * barres latérales de l'application et la colonne des catégories, elle peut
 * être étroite sur un grand écran.
 */

/** Un titre suivi de son aide. */
function TitleWithHelp({ title, help, className }: { title: string; help?: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {title}
      {help && <HelpHint title={title}>{help}</HelpHint>}
    </span>
  );
}

/** L'en-tête d'une catégorie : titre, aide, et son interrupteur encadré s'il en a un. */
export function FeaturePage({
  title,
  help,
  toggle,
  children,
}: {
  title: string;
  help?: string;
  toggle?: {
    /** « Activée », « Désactivée »… selon l'état. */
    label: string;
    /** Le nom de l'interrupteur pour les lecteurs d'écran : « Activer la carte ». */
    ariaLabel: string;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
  children?: React.ReactNode;
}) {
  return (
    <div className="@container min-w-0 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h3 className="min-w-0 text-xl font-semibold tracking-tight">
          <TitleWithHelp title={title} help={help} />
        </h3>
        {toggle && (
          <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-lg border border-border-soft px-3 py-2 text-sm">
            {toggle.label}
            <Switch
              checked={toggle.checked}
              disabled={toggle.disabled}
              onCheckedChange={toggle.onCheckedChange}
              aria-label={toggle.ariaLabel}
            />
          </label>
        )}
      </header>
      {children}
    </div>
  );
}

/** Une section : titre (et aide) à gauche, réglages à droite. */
export function SettingsSection({
  title,
  help,
  meta,
  aside,
  className,
  children,
}: {
  title: string;
  help?: string;
  /** Une donnée sous le titre (« 12 mois · 365 jours »), pas une description. */
  meta?: React.ReactNode;
  /** Sous le titre : une action secondaire. */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn("grid gap-4 border-t border-border-soft pt-6 @2xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @2xl:gap-10", className)}
    >
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">
          <TitleWithHelp title={title} help={help} />
        </h4>
        {meta && <p className="text-sm tabular-nums text-muted-foreground">{meta}</p>}
        {aside}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

/** Une liste bordée de réglages, une ligne chacun. */
export function ToggleList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border-soft rounded-lg border border-border-soft", className)}>
      {children}
    </div>
  );
}

/** Une ligne de réglage : titre, aide, et son contrôle à droite (un interrupteur par défaut). */
export function ToggleItem({
  title,
  help,
  checked,
  disabled,
  onCheckedChange,
  control,
  indent = false,
}: {
  title: string;
  help?: string;
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Un autre contrôle qu'un interrupteur (champ, bouton). */
  control?: React.ReactNode;
  /** Une option qui dépend de la ligne au-dessus. */
  indent?: boolean;
}) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-4 px-4 py-2.5", indent && "pl-8")}>
      <p className={cn("min-w-0 text-sm", indent ? "text-muted-foreground" : "font-medium")}>
        <TitleWithHelp title={title} help={help} />
      </p>
      {control ?? (
        <Switch
          checked={!!checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={title}
          className="shrink-0"
        />
      )}
    </div>
  );
}

/** L'état d'une catégorie, dans la colonne de gauche : « Actif » ou « Off ». */
export function StatusPill({ id, active, onLabel, offLabel }: { id?: string; active: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      id={id}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        active ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
      )}
      data-testid="feature-status"
      data-active={active || undefined}
    >
      {active ? onLabel : offLabel}
    </span>
  );
}
