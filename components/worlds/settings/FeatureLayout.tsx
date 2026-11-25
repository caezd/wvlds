"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { HelpHint } from "@/components/ui/help-hint";
import { createPortal } from "react-dom";
import { ChevronRight, Plus, PowerOff } from "lucide-react";
import { InteractiveCard } from "@/components/ui/interactive-card";

/**
 * La mise en page des paramètres d'un monde : des sections à plat, séparées
 * par un trait, en deux colonnes (titre à gauche, réglages à droite) quand la
 * page a la place. Le titre de la page, son interrupteur et ses actions montent dans la barre
 * d'en-tête du panneau (WorldPanelHeader), comme sur Membres ou Personas :
 * voir SettingsHeaderProvider.
 *
 * Deux surfaces : les cartes (`SURFACE` : fond des cartes, bordure douce) et
 * les champs qu'elles contiennent (`FIELD` : fond de la page, plus sombre,
 * comme creusés dans la carte).
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
export const SETTINGS_ROW = cn("flex min-h-12 flex-wrap items-center gap-3 rounded-lg py-1.5 pl-3 pr-1.5", SURFACE);

/**
 * Les deux emplacements de la barre d'en-tête où la page ouverte place son
 * titre (après « Paramètres ») et ses actions (à droite). Sans fournisseur
 * (une page rendue seule, en test), la page garde son propre en-tête.
 */
type HeaderSlots = { title: HTMLElement | null; actions: HTMLElement | null };
const SettingsHeaderContext = React.createContext<HeaderSlots | null>(null);
export const SettingsHeaderProvider = SettingsHeaderContext.Provider;
/**
 * Une page montée mais cachée (les pages des fonctions restent montées) ne
 * prend pas la barre d'en-tête : seule la page affichée y écrit.
 */
const PageShownContext = React.createContext(true);
export const SettingsPageShown = PageShownContext.Provider;

/** La page place son titre dans la barre d'en-tête (et n'a plus besoin de son propre retour). */
export function useSettingsHeaderMode(): boolean {
  const slots = React.useContext(SettingsHeaderContext);
  return !!(slots?.title && slots.actions);
}

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
 * Une page : titre, sous-titre (à quoi sert la page), et pour une fonction
 * son interrupteur. Dans les paramètres d'un monde, le titre, l'interrupteur
 * et les actions (`actions` : « Nouveau groupe ») montent dans la barre
 * d'en-tête ; la page ne garde que son sous-titre. L'interrupteur n'a pas de
 * libellé visible : son aide dit ce que la désactivation garde.
 */
export function FeaturePage({
  title,
  description,
  toggle,
  actions,
  back,
  fill = false,
  children,
}: {
  title: string;
  /** Une phrase : à quoi sert la page. */
  description?: React.ReactNode;
  /** Les boutons de la page (en-tête, à droite), en `outline` comme sur Membres. */
  actions?: React.ReactNode;
  /** La page parente, dans le fil d'Ariane de l'en-tête (la fiche d'un groupe). */
  back?: { label: string; onClick: () => void };
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
  const slots = React.useContext(SettingsHeaderContext);
  const shown = React.useContext(PageShownContext);
  const inHeader = !!(slots?.title && slots.actions);

  const toggleNode = toggle && (
    <span className="flex shrink-0 items-center gap-2">
      {toggle.help && <HelpHint title={toggle.ariaLabel}>{toggle.help}</HelpHint>}
      <Switch
        checked={toggle.checked}
        disabled={toggle.disabled}
        onCheckedChange={toggle.onCheckedChange}
        aria-label={toggle.ariaLabel}
      />
    </span>
  );

  return (
    <div className={cn("@container min-w-0 space-y-6", fill && FILL)}>
      {inHeader ? (
        shown && (
          <>
            {createPortal(
              <>
                {back && (
                  <>
                    <Crumb />
                    <button
                      type="button"
                      onClick={back.onClick}
                      className="shrink-0 truncate text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {back.label}
                    </button>
                  </>
                )}
                <Crumb />
                <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
              </>,
              slots!.title!,
            )}
            {(actions || toggleNode) && createPortal(<>{actions}{toggleNode}</>, slots!.actions!)}
          </>
        )
      ) : (
        <header className="flex shrink-0 items-start justify-between gap-4">
          <h3 className="min-w-0 text-xl font-semibold tracking-tight">{title}</h3>
          {(actions || toggleNode) && <span className="flex shrink-0 items-center gap-2 pt-1">{actions}{toggleNode}</span>}
        </header>
      )}
      {description && <p className={cn(DESCRIPTION, "max-w-prose shrink-0")}>{description}</p>}
      {children}
    </div>
  );
}

/** Le séparateur du fil d'Ariane de l'en-tête. */
function Crumb() {
  return <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

/**
 * Une section, à plat (pas de carte : trop de cartes alourdissent la page).
 * Par défaut en deux colonnes : titre, compteur et sous-titre à gauche,
 * réglages à droite, un trait au-dessus. `stacked` : le contenu passe sous
 * l'en-tête, pour ce qui a besoin de toute la largeur (tableau, liste,
 * journal). L'aide (`help`) reste pour un détail rare ; l'explication utile
 * va dans `description`, visible.
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
        "grid gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0",
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
      className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
    >
      <Plus className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

/**
 * Une liste encore vide : une seule tuile en pointillés, comme « + Nouveau
 * persona » sur Membres — la phrase, et l'action qui la remplit (`action`,
 * ou `onAdd` + `addLabel` pour un « + » centré).
 */
export function SettingsEmpty({
  children,
  action,
  onAdd,
  addLabel,
  testId,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      <span className="text-pretty">{children}</span>
      {onAdd && addLabel && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          {addLabel}
        </button>
      )}
      {action}
    </div>
  );
}

/**
 * Un choix qui a des conséquences : des cartes avec icône, titre et phrase,
 * comme la visibilité d'un salon (ChatroomVisibilityField). Une seule
 * enfoncée (`radio`) ; `multiple` : plusieurs (`aria-pressed`).
 * Pour une valeur courte, SettingsSegmented.
 */
export function SettingsChoiceCards<T extends string>({
  label,
  options,
  value,
  onToggle,
  multiple = false,
  disabled,
  testIdPrefix,
}: {
  /** Le nom du groupe pour les lecteurs d'écran. */
  label: string;
  options: readonly { value: T; label: string; description?: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }[];
  /** Les options enfoncées. */
  value: readonly T[];
  /** Une option choisie (ou, `multiple`, basculée). */
  onToggle: (value: T) => void;
  multiple?: boolean;
  disabled?: boolean;
  testIdPrefix?: string;
}) {
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      className={cn("grid gap-2", options.length >= 3 ? "@md:grid-cols-3" : "@md:grid-cols-2")}
    >
      {options.map((o) => {
        const on = value.includes(o.value);
        const Icon = o.icon;
        return (
          <InteractiveCard
            key={o.value}
            {...(multiple ? { active: on } : { role: "radio", "aria-checked": on })}
            data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
            disabled={disabled}
            onClick={() => { if (multiple || !on) onToggle(o.value); }}
            className={cn(
              "flex items-start gap-3 p-3 disabled:opacity-60",
              on && "border-foreground bg-background",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                on ? "bg-muted text-foreground" : "bg-background text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 space-y-0.5 pt-0.5">
              <span className="block text-sm font-semibold">{o.label}</span>
              {o.description && <span className="block text-xs leading-snug text-muted-foreground text-pretty">{o.description}</span>}
            </span>
          </InteractiveCard>
        );
      })}
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
    <div role={label ? "group" : undefined} aria-label={label} className={cn("divide-y divide-border rounded-lg", SURFACE, className)}>
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
 * Les réglages d'une option ou d'une fonction désactivée, grisés et inertes.
 * Un `fieldset` désactivé : ses champs et boutons le sont aussi (et restent
 * lus par les lecteurs d'écran, contrairement à `inert`).
 *
 * `feature` : la page d'une fonction entière. Plutôt qu'une page voilée,
 * une tuile « Cette fonction est désactivée » avec de quoi l'activer, et
 * l'aperçu des réglages replié dessous.
 */
export function InactiveOptions({
  inactive,
  className,
  feature,
  children,
}: {
  inactive: boolean;
  /** Pour le cadre grisé seulement (actives, les options sont rendues telles quelles). */
  className?: string;
  feature?: { onActivate?: () => void; disabled?: boolean };
  children: React.ReactNode;
}) {
  const t = useTranslations("worlds.settings");
  if (!inactive) return <>{children}</>;
  const greyed = (
    <fieldset
      disabled
      data-testid="inactive-options"
      className={cn(
        "pointer-events-none m-0 min-w-0 border-0 p-0 opacity-60 select-none [&_[data-testid=help-hint]]:pointer-events-auto",
        !feature && className,
        feature && "space-y-4",
      )}
    >
      {children}
    </fieldset>
  );
  if (!feature) return greyed;
  return (
    <div className="space-y-3" data-testid="feature-off">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <PowerOff className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">{t("featureOff")}</p>
        {feature.onActivate && (
          <Button type="button" size="sm" disabled={feature.disabled} onClick={feature.onActivate}>
            {t("featureOffActivate")}
          </Button>
        )}
      </div>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          {t("featureOffPreview")}
        </summary>
        <div className="pt-3">{greyed}</div>
      </details>
    </div>
  );
}

/**
 * Une fonction désactivée, dans le menu : on ne marque que l'exception. Une
 * icône discrète ; le mot (« Désactivé ») se lit en description.
 */
export function FeatureOffMark({ id, label }: { id?: string; label: string }) {
  return (
    <span data-testid="feature-status" className="flex shrink-0 items-center text-muted-foreground">
      <PowerOff className="size-3.5" aria-hidden />
      <span id={id} className="sr-only">{label}</span>
    </span>
  );
}
