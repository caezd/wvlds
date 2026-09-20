"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Minus, Plus, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { catalogItemMatches, normalizeForSearch } from "@/lib/worldCatalog";
import {
  recipeTree,
  relationsFrom,
  relationsTo,
  type CatalogRelation,
  type CatalogRelationKind,
  type RecipeNode,
} from "@/lib/catalogRelations";
import type { WorldCatalogItem } from "@/types/worlds";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CatalogVisual } from "./CatalogVisual";

export const MAX_ITEM_RELATIONS = 20;

/**
 * Les relations d'un monde (migration 187), d'un genre, lues à la demande.
 * Une table courte : on la prend entière plutôt que par objet, la fiche
 * comme l'éditeur de compétences en lisent les deux sens.
 */
export function useCatalogRelations(worldId: string | null | undefined, kind: CatalogRelationKind, enabled = true) {
  const [relations, setRelations] = useState<CatalogRelation[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!worldId || !enabled) return;
    let cancelled = false;
    // Le client ne se crée qu'ici : sans monde, rien ne s'ouvre.
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from(TABLE.WORLD_CATALOG_ITEM_RELATIONS)
        .select("from_id, to_id, kind, quantity, sort_index")
        .eq("world_id", worldId)
        .eq("kind", kind)
        .order("sort_index");
      if (!cancelled) setRelations((data ?? []) as CatalogRelation[]);
    })();
    return () => { cancelled = true; };
  }, [worldId, kind, enabled, version]);
  return { relations, reload: () => setVersion((v) => v + 1) };
}

/** Une ligne d'objet, compacte : visuel et nom, cliquable si on lui donne quoi faire. */
export function CatalogItemChip({
  item,
  quantity,
  onOpen,
  onRemove,
  onQuantity,
  removeLabel,
  className,
}: {
  item: WorldCatalogItem | undefined;
  quantity?: number;
  onOpen?: () => void;
  onRemove?: () => void;
  onQuantity?: (next: number) => void;
  removeLabel?: string;
  className?: string;
}) {
  const t = useTranslations("catalogue");
  const name = item?.name ?? t("orphanedItem");
  const inner = (
    <>
      <CatalogVisual icon={item?.icon ?? null} lucideIcon={item?.lucide_icon ?? null} imageUrl={item?.image_url ?? null} size={20} framed={false} />
      <span className="truncate">{name}</span>
    </>
  );
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-soft bg-muted/40 px-2 py-1 text-xs", className)}>
      {onOpen && item ? (
        <button type="button" onClick={onOpen} className="inline-flex min-w-0 items-center gap-1.5 hover:underline">{inner}</button>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5">{inner}</span>
      )}
      {quantity !== undefined && onQuantity && (
        <span className="inline-flex items-center gap-0.5 rounded-md border border-border-soft bg-background">
          <button type="button" aria-label={t("quantityLess")} onClick={() => onQuantity(Math.max(1, quantity - 1))} className="px-1 text-muted-foreground hover:text-foreground"><Minus className="h-3 w-3" /></button>
          <span className="min-w-5 text-center tabular-nums">{quantity}</span>
          <button type="button" aria-label={t("quantityMore")} onClick={() => onQuantity(Math.min(9999, quantity + 1))} className="px-1 text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
        </span>
      )}
      {quantity !== undefined && !onQuantity && <span className="tabular-nums text-muted-foreground">× {quantity}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel ?? t("removeRelation", { name })} className="rounded-full p-0.5 text-muted-foreground hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Choisir des objets du catalogue parmi des candidats (Popover + Command) :
 * les prérequis d'une compétence, les ingrédients d'un objet.
 */
export function CatalogItemPicker({
  candidates,
  onPick,
  label,
  disabled,
}: {
  candidates: WorldCatalogItem[];
  onPick: (item: WorldCatalogItem) => void;
  label: string;
  disabled?: boolean;
}) {
  const t = useTranslations("catalogue");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matching = useMemo(() => {
    const normalized = normalizeForSearch(query.trim());
    return normalized ? candidates.filter((c) => catalogItemMatches(c, normalized)) : candidates;
  }, [candidates, query]);
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-6 rounded-full px-2 text-xs" disabled={disabled || candidates.length === 0}>
          <Plus className="mr-1 h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={t("searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            <CommandGroup>
              {matching.map((item) => (
                <CommandItem key={item.id} value={item.id} onSelect={() => { onPick(item); setOpen(false); setQuery(""); }} className="gap-2 text-sm">
                  <CatalogVisual icon={item.icon ?? null} lucideIcon={item.lucide_icon ?? null} imageUrl={item.image_url ?? null} size={20} framed={false} />
                  <span className="truncate">{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Une ligne de relations à éditer : `{ to_id, quantity }`, dans l'ordre. */
export type RelationDraft = { to_id: string; quantity: number };

/**
 * L'éditeur d'un genre de relations sur le dialogue d'objet : les pastilles
 * (avec quantité pour une recette) et le sélecteur des candidats — les objets
 * du même catalogue, sauf l'objet lui-même et ceux déjà retenus.
 */
export function RelationsEditor({
  kind,
  value,
  onChange,
  item,
  siblings,
}: {
  kind: CatalogRelationKind;
  value: RelationDraft[];
  onChange: (next: RelationDraft[]) => void;
  item: WorldCatalogItem;
  siblings: WorldCatalogItem[];
}) {
  const t = useTranslations("catalogue");
  const byId = useMemo(() => new Map(siblings.map((s) => [s.id, s])), [siblings]);
  const chosen = new Set(value.map((v) => v.to_id));
  const candidates = siblings.filter((s) => s.id !== item.id && s.type === item.type && !chosen.has(s.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((row) => (
        <CatalogItemChip
          key={row.to_id}
          item={byId.get(row.to_id)}
          quantity={kind === "ingredient" ? row.quantity : undefined}
          onQuantity={kind === "ingredient" ? (q) => onChange(value.map((v) => (v.to_id === row.to_id ? { ...v, quantity: q } : v))) : undefined}
          onRemove={() => onChange(value.filter((v) => v.to_id !== row.to_id))}
        />
      ))}
      <CatalogItemPicker
        candidates={candidates}
        onPick={(picked) => onChange([...value, { to_id: picked.id, quantity: 1 }])}
        label={kind === "prerequisite" ? t("addPrerequisite") : t("addIngredient")}
        disabled={value.length >= MAX_ITEM_RELATIONS}
      />
    </div>
  );
}

// ── Sections de la fiche ─────────────────────────────────────────────────────

/** Les prérequis d'une compétence et ce qu'elle débloque. */
export function PrerequisiteSections({
  item,
  relations,
  catalog,
  onNavigate,
}: {
  item: WorldCatalogItem;
  relations: CatalogRelation[];
  catalog: ReadonlyMap<string, WorldCatalogItem>;
  onNavigate?: (item: WorldCatalogItem) => void;
}) {
  const t = useTranslations("catalogue");
  const requires = relationsFrom(item.id, relations, "prerequisite");
  const unlocks = relationsTo(item.id, relations, "prerequisite");
  if (requires.length === 0 && unlocks.length === 0) return null;
  const chips = (ids: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const target = catalog.get(id);
        return <CatalogItemChip key={id} item={target} onOpen={onNavigate && target ? () => onNavigate(target) : undefined} />;
      })}
    </div>
  );
  return (
    <>
      {requires.length > 0 && (
        <section data-testid="prerequisites">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("prerequisites")}</h3>
          {chips(requires.map((r) => r.to_id))}
        </section>
      )}
      {unlocks.length > 0 && (
        <section data-testid="unlocks">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("unlocks")}</h3>
          {chips(unlocks.map((r) => r.from_id))}
        </section>
      )}
    </>
  );
}

function RecipeBranch({
  node,
  catalog,
  onNavigate,
  depth,
}: {
  node: RecipeNode;
  catalog: ReadonlyMap<string, WorldCatalogItem>;
  onNavigate?: (item: WorldCatalogItem) => void;
  depth: number;
}) {
  const t = useTranslations("catalogue");
  // Le premier niveau se lit d'un coup ; les sous-compositions se déplient.
  const [openState, setOpen] = useState(false);
  const target = catalog.get(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={openState}
            aria-label={openState ? t("collapseRecipe", { name: target?.name ?? "" }) : t("expandRecipe", { name: target?.name ?? "" })}
            onClick={() => setOpen((o) => !o)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", openState && "rotate-90")} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <CatalogItemChip item={target} quantity={node.quantity} onOpen={onNavigate && target ? () => onNavigate(target) : undefined} />
        {node.truncated && <span className="text-[11px] text-muted-foreground">{t("recipeTruncated")}</span>}
      </div>
      {hasChildren && openState && (
        <ul className="ml-3 mt-1 space-y-1 border-l border-border-soft pl-3">
          {node.children.map((child) => (
            <RecipeBranch key={child.id} node={child} catalog={catalog} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** La composition d'un objet en arbre, et où il entre comme ingrédient. */
export function RecipeSections({
  item,
  relations,
  catalog,
  onNavigate,
}: {
  item: WorldCatalogItem;
  relations: CatalogRelation[];
  catalog: ReadonlyMap<string, WorldCatalogItem>;
  onNavigate?: (item: WorldCatalogItem) => void;
}) {
  const t = useTranslations("catalogue");
  const tree = useMemo(() => recipeTree(item.id, relations), [item.id, relations]);
  const usedIn = relationsTo(item.id, relations, "ingredient");
  if (tree.children.length === 0 && usedIn.length === 0) return null;
  return (
    <>
      {tree.children.length > 0 && (
        <section data-testid="recipe">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("recipe")}</h3>
          <ul className="space-y-1">
            {tree.children.map((child) => (
              <RecipeBranch key={child.id} node={child} catalog={catalog} onNavigate={onNavigate} depth={0} />
            ))}
          </ul>
        </section>
      )}
      {usedIn.length > 0 && (
        <section data-testid="used-in">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("usedIn")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {usedIn.map((r) => {
              const product = catalog.get(r.from_id);
              return <CatalogItemChip key={r.from_id} item={product} quantity={r.quantity} onOpen={onNavigate && product ? () => onNavigate(product) : undefined} />;
            })}
          </div>
        </section>
      )}
    </>
  );
}
