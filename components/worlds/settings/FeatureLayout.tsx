"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HelpHint } from "@/components/ui/help-hint";
import { Plus } from "lucide-react";

/**
 * La mise en page des réglages de fonctions (onglet Fonctions) : une page
 * par catégorie, faite de sections à deux colonnes — titre à gauche,
 * réglages à droite —, avec des listes d'interrupteurs bordées. Pas de
 * description sous les titres : l'explication est derrière l'aide (voir
 * HelpHint), à côté du titre.
 *
 * Deux surfaces, partout : les cartes (`SURFACE` : fond des cartes, bordure
 * douce) et les champs qu'elles contiennent (`FIELD` : fond de la page, plus
 * sombre, comme creusés dans la carte, même bordure douce).
 *
 * La page est un conteneur (`@container`) : ses sections passent en deux
 * colonnes selon la place qu'elle a, pas selon la fenêtre — entre les
 * barres latérales de l'application et la colonne des catégories, elle peut
 * être étroite sur un grand écran.
 */

/** Une carte : encadré de réglages, liste, tuile. */
export const SURFACE = "border border-border bg-card";
/** Un champ dans une carte ou sur la page : saisie, sélecteur, petite case. */
export const FIELD = "border-border bg-background shadow-none hover:bg-background";
/** La largeur de toutes les pages des paramètres d'un monde. */
export const SETTINGS_PAGE_WIDTH = "w-full max-w-4xl";
/**
 * Un maillon de la chaîne qui donne toute la hauteur restante à une page
 * (l'onglet Objets de l'Inventaire) : flex en colonne, s'étire, et peut
 * rétrécir sous son contenu pour que le défilement se fasse plus bas.
 */
export const FILL = "flex min-h-0 flex-1 flex-col";
/** Une ligne d'une liste d'éléments (salles, groupes, relations, catégories). */
export const SETTINGS_ROW = cn("flex min-h-12 flex-wrap items-center gap-3 rounded-md py-1.5 pl-3 pr-1.5", SURFACE);

/** Un titre suivi de son aide. */
export function TitleWithHelp({ title, help, className }: { title: string; help?: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {title}
      {help && <HelpHint title={title}>{help}</HelpHint>}
    </span>
  );
}

/** Le sous-titre d'une page ou d'une section : l'explication, en clair. */
const DESCRIPTION = "text-sm text-muted-foreground text-pretty";

/**
 * L'en-tête d'une page : titre, sous-titre (à quoi sert la page) et, pour une
 * fonction, son interrupteur. L'interrupteur n'a pas de libellé visible :
 * l'état se lit dans la pastille du menu, et un « Activée » / « Activé »
 * accordé au genre de chaque fonction n'apprenait rien. Son aide dit ce que
 * la désactivation garde.
 */
export function FeaturePage({
  title,
  description,
  toggle,
  fill = false,
  children,
}: {
  title: string;
  /** Une phrase : à quoi sert la page. */
  description?: React.ReactNode;
  /** La page prend toute la hauteur restante (voir FILL). */
  fill?: boolean;
  toggle?: {
    /** Le nom de l'interrupteur pour les lecteurs d'écran : « Activer la carte ». */
    ariaLabel: string;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
    /** Ce que la désactivation garde (« rien n'est supprimé »). */
    help?: string;
  };
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("@container min-w-0 space-y-6", fill && FILL)}>
      <header className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          {description && <p className={cn(DESCRIPTION, "max-w-prose")}>{description}</p>}
        </div>
        {toggle && (
          <span className="flex shrink-0 items-center gap-2 pt-1">
            {toggle.help && <HelpHint title={toggle.ariaLabel}>{toggle.help}</HelpHint>}
            <Switch
              checked={toggle.checked}
              disabled={toggle.disabled}
              onCheckedChange={toggle.onCheckedChange}
              aria-label={toggle.ariaLabel}
            />
          </span>
        )}
      </header>
      {children}
    </div>
  );
}

/**
 * Une section. Par défaut en deux colonnes : titre, compteur et sous-titre à
 * gauche, réglages à droite. `stacked` : le contenu passe sous l'en-tête, pour
 * ce qui a besoin de toute la largeur (tableau, liste maître-détail, journal).
 * L'aide (`help`) reste pour un détail rare ; l'explication utile va dans
 * `description`, visible.
 */
export function SettingsSection({
  title,
  description,
  count,
  help,
  meta,
  aside,
  layout = "columns",
  className,
  children,
}: {
  title: string;
  /** Une ou deux phrases : à quoi sert la section. */
  description?: React.ReactNode;
  /** Un compteur à côté du titre (« 3 », « 5 sur 5 »). */
  count?: React.ReactNode;
  help?: string;
  /** Une donnée sous le titre (« 12 mois · 365 jours »), pas une description. */
  meta?: React.ReactNode;
  /** Sous le titre : une action secondaire ou l'indicateur d'enregistrement. */
  aside?: React.ReactNode;
  layout?: "columns" | "stacked";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-layout={layout}
      className={cn(
        "grid gap-4 border-t border-border pt-6",
        layout === "columns" && "@2xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @2xl:gap-10",
        className,
      )}
    >
      <div className="space-y-1">
        <h4 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <TitleWithHelp title={title} help={help} />
          {count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
          )}
        </h4>
        {description && <p className={DESCRIPTION}>{description}</p>}
        {meta && <p className="text-sm tabular-nums text-muted-foreground">{meta}</p>}
        {aside}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

/** La dernière rangée d'une liste : « + Ajouter… », en pointillés, sur toute la largeur. */
export function SettingsAddRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 w-full items-center gap-2 rounded-md border border-dashed border-border px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
    >
      <Plus className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

/** Une liste encore vide : une phrase et, souvent, l'action qui la remplit. */
export function SettingsEmpty({ children, action, testId }: { children: React.ReactNode; action?: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
      <span>{children}</span>
      {action}
    </div>
  );
}

/**
 * Choisir parmi deux à quatre options courtes : un seul contrôle segmenté
 * pour tous les réglages. Des options qui ont besoin d'une phrase passent par
 * des boutons radio ; au-delà de quatre, par une liste déroulante.
 */
export function SettingsSegmented<T extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: {
  /** Le nom du groupe pour les lecteurs d'écran. */
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => { if (!on) onValueChange(o.value); }}
            className={cn(
              "flex h-full items-center rounded-sm px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Une liste bordée de réglages, une ligne chacun. */
export function ToggleList({ children, className, label }: { children: React.ReactNode; className?: string; /** Nomme la liste (groupe) quand une page en a plusieurs. */ label?: string }) {
  return (
    <div role={label ? "group" : undefined} aria-label={label} className={cn("divide-y divide-border rounded-md", SURFACE, className)}>
      {children}
    </div>
  );
}

/** Une ligne de réglage : titre, aide, et son contrôle à droite (un interrupteur par défaut). */
export function ToggleItem({
  title,
  help,
  description,
  icon,
  badge,
  dimmed = false,
  checked,
  disabled,
  onCheckedChange,
  control,
  indent = false,
}: {
  title: string;
  help?: string;
  /** Une explication laissée en clair sous le titre (les permissions d'un rôle). */
  description?: React.ReactNode;
  /** Avant le titre. */
  icon?: React.ReactNode;
  /** Après le titre : une pastille d'état. */
  badge?: React.ReactNode;
  /** Une ligne qui ne dépend plus d'elle-même (réglée par une autre). */
  dimmed?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Un autre contrôle qu'un interrupteur (champ, bouton). */
  control?: React.ReactNode;
  /** Une option qui dépend de la ligne au-dessus. */
  indent?: boolean;
}) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-4 px-4 py-2.5", indent && "pl-8", dimmed && "opacity-60")}>
      <div className="min-w-0">
        <p className={cn("flex min-w-0 items-center gap-2 text-sm", indent ? "text-muted-foreground" : "font-medium")}>
          {icon}
          <TitleWithHelp title={title} help={help} />
          {badge}
        </p>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
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

/**
 * Les réglages d'une fonction désactivée : toujours affichés, pour qu'on voie
 * ce que la fonction offre, mais grisés et inertes jusqu'à son activation.
 * Un `fieldset` désactivé : ses champs et boutons le sont aussi (et restent
 * lus par les lecteurs d'écran, contrairement à `inert`). Pas de mention :
 * l'interrupteur « Désactivé » et le grisé suffisent. L'aide reste au survol.
 */
export function InactiveOptions({
  inactive,
  className,
  children,
}: {
  inactive: boolean;
  /** Pour le cadre grisé seulement (actives, les options sont rendues telles quelles). */
  className?: string;
  children: React.ReactNode;
}) {
  if (!inactive) return <>{children}</>;
  return (
    <fieldset
      disabled
      data-testid="inactive-options"
      className={cn(
        "pointer-events-none m-0 min-w-0 border-0 p-0 opacity-60 select-none [&_[data-testid=help-hint]]:pointer-events-auto",
        className,
      )}
    >
      {children}
    </fieldset>
  );
}

/** L'état d'une catégorie, dans la colonne de gauche : « Actif » ou « Off ». */
export function StatusPill({ id, active, onLabel, offLabel }: { id?: string; active: boolean; onLabel: string; offLabel: string }) {
  return (
    <Badge
      id={id}
      tone={active ? "success" : "neutral"}
      className={active ? undefined : "text-muted-foreground"}
      data-testid="feature-status"
      data-active={active || undefined}
    >
      {active ? onLabel : offLabel}
    </Badge>
  );
}
