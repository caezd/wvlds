"use client";

import { useTranslations } from "next-intl";
import {
  Pencil, Trash2, GripVertical, Copy, MoreHorizontal, FolderInput,
} from "lucide-react";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { RARITY_COLORS } from "@/lib/worldCatalog";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { CatalogVisual } from "./CatalogVisual";
import { useCatalogueRow } from "./CatalogueRowContext";
import { type CatalogItem } from "./catalogueTypes";

// Briques élémentaires d'une ligne de catalogue.

// ── Icon display ──────────────────────────────────────────────────────────────

/** Le visuel d'un objet dans une ligne du catalogue. */
export function CatalogIcon({
  icon,
  lucideIcon,
  imageUrl,
  size = "md",
}: {
  icon?: string | null;
  lucideIcon?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md";
}) {
  return (
    <CatalogVisual
      icon={icon}
      lucideIcon={lucideIcon}
      imageUrl={imageUrl}
      size={size === "sm" ? 32 : 40}
    />
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

export function DragHandle(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

// ── Sortable item row ─────────────────────────────────────────────────────────

/**
 * Une ligne du catalogue.
 *
 * `canEdit` ouvre les commandes ; `canReorder` la poignée de déplacement. Les
 * deux sont distincts depuis la recherche : une liste filtrée ne montre plus
 * les voisins d'un objet, et l'y faire glisser reviendrait à réécrire des rangs
 * qu'on ne voit pas.
 *
 * Les commandes tiennent dans un menu « ⋯ », et non en trois icônes révélées
 * au survol : le survol n'existe pas au doigt, et « Supprimer » y était collé
 * à « Modifier ». Le menu porte aussi « Déplacer vers… » — classer un objet
 * sans le glisser, ce qui reste possible quand une recherche a suspendu le
 * glisser-déposer. La case à cocher, elle, ouvre la sélection multiple.
 */
export function SortableItemRow({
  item,
  canEdit,
  canReorder,
  usageCount,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenDetail,
}: {
  item: CatalogItem;
  canEdit: boolean;
  canReorder: boolean;
  usageCount?: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const { categories, onMoveItem, selectedIds, onToggleSelected } = useCatalogueRow();
  const selected = selectedIds.has(item.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", categoryId: item.category_id },
    disabled: !canReorder,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-selected={selected || undefined}
      className={cn(
        "group/item flex items-center gap-2 rounded-lg px-2 py-1 transition-colors",
        selected && "bg-primary/5",
      )}
    >
      {canReorder && <DragHandle {...attributes} {...listeners} />}
      {canEdit && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(item.id)}
          aria-label={t("selectItem", { name: item.name })}
          className={cn(
            "shrink-0 transition-opacity",
            !selected && "opacity-40 group-hover/item:opacity-100 focus-visible:opacity-100",
          )}
        />
      )}
      <CatalogIcon icon={item.icon} lucideIcon={item.lucide_icon} imageUrl={item.image_url} size="sm" />
      <button
        type="button"
        onClick={onOpenDetail}
        className="min-w-0 flex-1 rounded text-left transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {item.rarity && (
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
            />
          )}
          <span className="truncate text-sm font-medium leading-snug">{item.name}</span>
          {usageCount !== undefined && usageCount > 0 && (
            <span
              title={t("usageCount", { count: usageCount })}
              className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
            >
              {usageCount}
            </span>
          )}
        </span>
        {item.description && (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        )}
      </button>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("itemActions", { name: item.name })}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-opacity hover:bg-secondary hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover/item:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {/* `afterMenuClose` : la modification ouvre un dialogue, une seconde
                couche modale par-dessus le menu qui se ferme. */}
            <DropdownMenuItem onSelect={afterMenuClose(onEdit)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> {tCommon("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="mr-2 h-3.5 w-3.5" /> {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 h-3.5 w-3.5" /> {t("moveTo")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                {categories.map((cat) => (
                  <DropdownMenuItem
                    key={cat.id}
                    disabled={cat.id === item.category_id}
                    onSelect={() => onMoveItem(item.id, cat.id)}
                  >
                    {cat.name}
                  </DropdownMenuItem>
                ))}
                {categories.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={item.category_id === null}
                  onSelect={() => onMoveItem(item.id, null)}
                >
                  {t("uncategorized")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Drag overlay renders ──────────────────────────────────────────────────────

export function ItemRowOverlay({ item }: { item: CatalogItem }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/95 px-2 py-2 shadow-xl backdrop-blur-sm">
      <GripVertical className="h-4 w-5 shrink-0 text-muted-foreground/30" />
      <CatalogIcon icon={item.icon} lucideIcon={item.lucide_icon} imageUrl={item.image_url} />
      <div className="flex-1 min-w-0 px-1">
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
    </div>
  );
}

export function CategoryRowOverlay({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-1.5 shadow-xl backdrop-blur-sm">
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
      <span className="text-sm font-semibold text-foreground/80">{name}</span>
    </div>
  );
}
