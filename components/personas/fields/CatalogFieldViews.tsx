"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { RARITY_COLORS, resolveCatalogEntry } from "@/lib/worldCatalog";
import type { InventoryItem, SkillItem } from "@/types/personas";
import type { WorldCatalogItem, WorldCatalogProperty } from "@/types/worlds";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CatalogVisual } from "@/components/worlds/catalogue/CatalogVisual";
import { CatalogItemDetail } from "@/components/worlds/catalogue/CatalogItemDetail";

/**
 * La fiche d'un objet du catalogue, ouverte d'un clic sur une entrée de la
 * fiche de persona (migration 186). Seule une entrée retrouvée dans le
 * catalogue en a une : une saisie libre ou un objet retiré n'ouvrent rien.
 */
function useCatalogDetail(catalog: Map<string, WorldCatalogItem> | undefined) {
  const [detail, setDetail] = useState<WorldCatalogItem | null>(null);
  const open = (catalogId: string | undefined) => {
    const item = catalogId ? catalog?.get(catalogId) : undefined;
    if (item) setDetail(item);
  };
  const sheet = detail ? (
    <CatalogItemDetail item={detail} catalog={catalog} onNavigate={setDetail} open onOpenChange={(v) => { if (!v) setDetail(null); }} />
  ) : null;
  return { open, sheet };
}

/**
 * L'inventaire et les compétences d'une fiche, en lecture.
 *
 * Ces deux rendus existaient en double, mot pour mot, dans
 * `PersonaProfileSheet` et `PersonaProfileSheetTrigger` — deux fichiers de
 * six cents lignes qui affichent la même fiche par deux chemins. Les faire
 * diverger n'était pas une hypothèse : c'est ce qui serait arrivé au premier
 * ajout, et l'ajout est justement là (image, rareté, propriétés, objet retiré).
 *
 * `catalog` est le catalogue du monde, indexé. Quand il vaut `undefined` —
 * appelant qui ne l'a pas chargé — la copie rangée dans la fiche sert de
 * secours, et rien n'est signalé comme retiré : voir `resolveCatalogEntry`.
 */

/** Le visuel d'une entrée, nu : dans une fiche, pas de cadre autour. */
function EntryImage({
  icon,
  lucideIcon,
  imageUrl,
  size,
}: {
  icon: string | null;
  lucideIcon: string | null;
  imageUrl: string | null;
  size: 20 | 28;
}) {
  return <CatalogVisual icon={icon} lucideIcon={lucideIcon} imageUrl={imageUrl} size={size} framed={false} />;
}

/**
 * Les propriétés d'une entrée — poids, portée, prérequis… — en ligne.
 *
 * Elles ne se lisaient que dans la fiche de l'objet, côté catalogue ; sur la
 * fiche d'un persona, où l'on regarde justement ce qu'il porte, elles
 * manquaient. Une liste courte et serrée : ce sont des textes de quelques
 * mots, pas des paragraphes (voir `sanitizeCatalogProperties`).
 */
export function EntryProperties({ properties, className }: { properties: WorldCatalogProperty[]; className?: string }) {
  if (properties.length === 0) return null;
  return (
    <dl className={cn("flex flex-wrap gap-x-3 gap-y-0.5 text-xs", className)}>
      {properties.map((property, index) => (
        <div key={index} className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">{property.label}</dt>
          <dd className="font-medium text-foreground/80">{property.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InventoryFieldView({
  items,
  catalog,
}: {
  items: InventoryItem[];
  catalog?: Map<string, WorldCatalogItem>;
}) {
  const detail = useCatalogDetail(catalog);
  const visible = items
    .map((item) => ({ item, resolved: resolveCatalogEntry(item, catalog) }))
    .filter(({ resolved }) => resolved.name);
  if (!visible.length) return null;

  return (
    <div className="rounded-lg border border-border-soft bg-muted/30 p-3">
      <div className="flex flex-wrap gap-2">
        {visible.map(({ item, resolved }) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <div
                role={item.catalog_id && !resolved.orphaned ? "button" : undefined}
                tabIndex={item.catalog_id && !resolved.orphaned ? 0 : undefined}
                onClick={() => detail.open(item.catalog_id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); detail.open(item.catalog_id); } }}
                className={cn(
                  "flex select-none items-center gap-1.5 rounded-md border bg-background px-2 py-1.5",
                  item.catalog_id && !resolved.orphaned ? "cursor-pointer hover:bg-muted/40" : "cursor-default",
                  resolved.orphaned ? "border-destructive/40" : "border-border-soft",
                )}
                // La rareté colore la bordure ; un objet retiré garde la
                // sienne, plus parlante que la couleur d'une rareté périmée.
                style={
                  resolved.rarity && !resolved.orphaned
                    ? { borderColor: `${RARITY_COLORS[resolved.rarity]}66` }
                    : undefined
                }
              >
                <EntryImage icon={resolved.icon} lucideIcon={resolved.lucide_icon} imageUrl={resolved.image_url} size={28} />
                <span className="text-sm font-medium leading-none">{resolved.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">x {item.quantity ?? 1}</span>
              </div>
            </TooltipTrigger>
            {(resolved.description || resolved.properties.length > 0) && (
              <TooltipContent side="top" className="max-w-[240px] space-y-1.5 text-center">
                {resolved.description && <p>{resolved.description}</p>}
                <EntryProperties properties={resolved.properties} className="justify-center" />
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </div>
      {detail.sheet}
    </div>
  );
}

export function SkillsFieldView({
  items,
  catalog,
}: {
  items: SkillItem[];
  catalog?: Map<string, WorldCatalogItem>;
}) {
  const detail = useCatalogDetail(catalog);
  const visible = items
    .map((item) => ({ item, resolved: resolveCatalogEntry(item, catalog) }))
    .filter(({ resolved }) => resolved.name);
  if (!visible.length) return null;

  return (
    <div className="space-y-2">
      {visible.map(({ item, resolved }) => (
        <div
          key={item.id}
          role={item.catalog_id && !resolved.orphaned ? "button" : undefined}
          tabIndex={item.catalog_id && !resolved.orphaned ? 0 : undefined}
          onClick={() => detail.open(item.catalog_id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); detail.open(item.catalog_id); } }}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2",
            item.catalog_id && !resolved.orphaned && "cursor-pointer hover:bg-muted/50",
            resolved.orphaned ? "border-destructive/40" : "border-border-soft",
          )}
        >
          <span className="mt-0.5">
            <EntryImage icon={resolved.icon} lucideIcon={resolved.lucide_icon} imageUrl={resolved.image_url} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium leading-tight">{resolved.name}</span>
              {item.level && (
                <span className="shrink-0 rounded-full border border-border-soft bg-muted/50 px-2 py-0.5 text-[0.65rem] font-medium tabular-nums text-muted-foreground">
                  {item.level}
                </span>
              )}
            </div>
            {resolved.description && (
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{resolved.description}</p>
            )}
            <EntryProperties properties={resolved.properties} className="mt-1" />
          </div>
        </div>
      ))}
      {detail.sheet}
    </div>
  );
}
