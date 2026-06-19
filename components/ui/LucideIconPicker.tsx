"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DynamicIcon, type IconName, iconNames } from "lucide-react/dynamic";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LUCIDE_CATEGORIES, LUCIDE_ALL_ICONS } from "@/lib/lucideCategories";
import { cn } from "@/lib/utils";

export const VALID_LUCIDE_ICONS = new Set<string>(iconNames);

const ICON_RENDER_CAP = 180;

export function prettyIconName(name: string) {
  const s = name.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const CATEGORY_LABELS_FR: Record<string, string> = {
  "Accessibility": "Accessibilité",
  "Accounts & access": "Comptes & accès",
  "Animals": "Animaux",
  "Arrows": "Flèches",
  "Buildings": "Bâtiments",
  "Charts": "Graphiques",
  "Communication": "Communication",
  "Connectivity": "Connectivité",
  "Cursors": "Curseurs",
  "Design": "Design",
  "Coding & development": "Code & développement",
  "Devices": "Appareils",
  "Emoji": "Emoji",
  "File icons": "Fichiers & dossiers",
  "Finance": "Finance",
  "Food & beverage": "Alimentation & boissons",
  "Gaming": "Jeux",
  "Home": "Maison",
  "Layout": "Mise en page",
  "Mail": "Courrier",
  "Mathematics": "Mathématiques",
  "Medical": "Médecine",
  "Multimedia": "Multimédia",
  "Nature": "Nature",
  "Navigation, Maps, and POIs": "Navigation & cartes",
  "Notification": "Notifications",
  "People": "Personnes",
  "Photography": "Photographie",
  "Science": "Sciences",
  "Seasons": "Saisons",
  "Security": "Sécurité",
  "Shapes": "Formes",
  "Shopping": "Shopping",
  "Social": "Réseaux sociaux",
  "Sports": "Sports",
  "Sustainability": "Durabilité",
  "Text formatting": "Mise en forme",
  "Time & calendar": "Temps & calendrier",
  "Tools": "Outils",
  "Transportation": "Transport",
  "Travel": "Voyage",
  "Weather": "Météo",
  "Autres": "Autres",
};

function LucideIconButton({
  name,
  active,
  accent,
  onClick,
}: {
  name: string;
  active: boolean;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={prettyIconName(name)}
      className={cn(
        "flex aspect-square items-center justify-center rounded-md border transition-colors",
        active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
      )}
    >
      <DynamicIcon
        name={name as IconName}
        className="h-4 w-4"
        style={active && accent ? { color: accent } : undefined}
      />
    </button>
  );
}

/**
 * Sélecteur d'icône Lucide avec recherche + navigation par catégories.
 *
 * - Sans `trigger` : affiche un bouton pleine largeur (usage dans un formulaire).
 * - Avec `trigger` : utilise l'élément fourni comme déclencheur du popover
 *   (usage compact, ex. icône inline dans une liste).
 */
export function LucideIconPicker({
  value,
  onChange,
  accent,
  trigger,
}: {
  value: string;
  onChange: (name: string) => void;
  accent?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase().replace(/\s+/g, "-");

  const searchResults = useMemo(
    () => (q ? LUCIDE_ALL_ICONS.filter((n) => n.includes(q)) : null),
    [q],
  );
  const shownSearch = searchResults?.slice(0, ICON_RENDER_CAP) ?? null;
  const searchOverflow = searchResults
    ? searchResults.length - (shownSearch?.length ?? 0)
    : 0;

  const defaultTrigger = (
    <button
      type="button"
      className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {value ? (
        <DynamicIcon
          name={value as IconName}
          className="h-4 w-4 shrink-0"
          style={accent ? { color: accent } : undefined}
        />
      ) : (
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("flex-1 truncate text-left", !value && "text-muted-foreground")}>
        {value ? prettyIconName(value) : "Choisir une icône…"}
      </span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setQuery(""); }}>
      <PopoverTrigger asChild>
        {trigger !== undefined ? (trigger as React.ReactElement) : defaultTrigger}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 z-[200]" align="start">
        {/* Recherche */}
        <div className="flex items-center gap-2 border-b border-border-soft px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans 1800+ icônes…"
            autoFocus
            className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div
          className="h-64 overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {q ? (
            <div className="grid grid-cols-7 gap-1 p-2">
              {shownSearch!.map((name) => (
                <LucideIconButton
                  key={name}
                  name={name}
                  active={value === name}
                  accent={accent}
                  onClick={() => { onChange(name); setOpen(false); }}
                />
              ))}
              {shownSearch!.length === 0 && (
                <p className="col-span-7 py-6 text-center text-xs text-muted-foreground">
                  Aucune icône
                </p>
              )}
              {searchOverflow > 0 && (
                <p className="col-span-7 pb-1 text-center text-[11px] text-muted-foreground">
                  +{searchOverflow} de plus — affinez la recherche
                </p>
              )}
            </div>
          ) : (
            LUCIDE_CATEGORIES.map((cat) => (
              <div key={cat.title}>
                <div className="sticky top-0 z-10 border-b border-border-soft/50 bg-popover px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {CATEGORY_LABELS_FR[cat.title] ?? cat.title}
                </div>
                <div className="grid grid-cols-7 gap-1 p-2">
                  {cat.icons
                    .filter((n) => VALID_LUCIDE_ICONS.has(n))
                    .map((name) => (
                      <LucideIconButton
                        key={name}
                        name={name}
                        active={value === name}
                        accent={accent}
                        onClick={() => { onChange(name); setOpen(false); }}
                      />
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
