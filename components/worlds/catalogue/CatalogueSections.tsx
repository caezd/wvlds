"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X, Plus, Pencil, Trash2, Loader2, Check, FolderPlus, ArrowUpAZ, ChevronRight,
} from "lucide-react";
import {
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { StoredImage } from "@/components/ui/stored-image";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { WorldCatalogCategory } from "@/types/worlds";
import { UNCAT, type CatalogType, type CatalogItem } from "./catalogueTypes";

import { DragHandle, SortableItemRow } from "./CataloguePieces";
import { SectionLabel } from "@/components/ui/section-label";
import { buttonVariants } from "@/components/ui/button";

// Conteneurs : une catégorie, la zone des non classés, une colonne.

// ── Sortable category container ───────────────────────────────────────────────

/**
 * Une catégorie et ses objets.
 *
 * Elle se replie d'un clic sur le chevron, pour tout le monde : c'est une
 * préférence de lecture, pas un geste d'auteur. Repliée, elle garde son
 * en-tête et son compte d'objets — et reste une cible de dépôt : l'objet
 * lâché sur l'en-tête va au bout de la catégorie, comme un dépôt sur son nom.
 */
export function SortableCategoryContainer({
  category,
  items,
  type,
  canEdit,
  canReorder,
  usage,
  collapsed,
  onToggleCollapsed,
  onEditItem,
  onDuplicateItem,
  onDeleteItem,
  onOpenItem,
  onAddIn,
  onEditCategory,
  onDeleteCategory,
  onSortAlpha,
}: {
  category: WorldCatalogCategory;
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  canReorder: boolean;
  usage: Record<string, number> | null;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  onEditItem: (item: CatalogItem) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onOpenItem: (item: CatalogItem) => void;
  /** Ouvre le dialogue de création, dans cette catégorie (`null` : sans). */
  onAddIn: (categoryId: string | null) => void;
  /** Ouvre la présentation de la catégorie : nom, description, bannière. */
  onEditCategory: (category: WorldCatalogCategory) => void;
  onDeleteCategory: (id: string) => void;
  onSortAlpha: (categoryId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    data: { type: "category" },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const hasPresentation = !!category.banner_url || !!category.description;

  return (
    <div ref={setNodeRef} style={style} className="space-y-0.5">
      {/* Category header */}
      <div className="group/cat flex items-center gap-1 rounded-xl px-2 py-1.5">
        {canReorder && <DragHandle {...attributes} {...listeners} />}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("expandCategory", { name: category.name }) : t("collapseCategory", { name: category.name })}
          onClick={() => onToggleCollapsed(category.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
        </button>
        <>
            <span className="flex-1 text-sm font-semibold text-muted-foreground truncate">{category.name}</span>
            <span
              title={t("itemCount", { count: items.length })}
              className="shrink-0 rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground"
            >
              {items.length}
            </span>
            {canEdit && (
              <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                <button
                  aria-label={t("editCategory", { name: category.name })}
                  type="button"
                  onClick={() => onEditCategory(category)}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-6")}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  aria-label={tCommon("delete")}
                  type="button"
                  onClick={() => onDeleteCategory(category.id)}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-6 hover:text-destructive")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
        </>
      </div>

      {/* Dépliée : la présentation de la catégorie, bannière puis description. */}
      {!collapsed && hasPresentation && (
        <div className="mx-2 mb-2 space-y-2" data-testid="category-presentation">
          {category.banner_url && (
            <div className="relative h-24 w-full overflow-hidden rounded-lg [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]">
              <StoredImage url={category.banner_url} width={720} height={240} alt="" className="object-cover" draggable={false} />
            </div>
          )}
          {category.description && (
            <MarkdownRenderer content={category.description} className="px-1 text-xs text-muted-foreground prose-sm" />
          )}
        </div>
      )}

      {/* Items in this category */}
      {!collapsed && <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5 min-h-[2px]">
          {items.map(item => (
            <SortableItemRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              canReorder={canReorder}
              usageCount={usage?.[item.id]}
              onEdit={() => onEditItem(item)}
              onDuplicate={() => onDuplicateItem(item.id)}
              onDelete={() => onDeleteItem(item.id)}
              onOpenDetail={() => onOpenItem(item)}
            />
          ))}

          {canEdit && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAddIn(category.id)}
                className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-muted-foreground transition-colors hover:border-ring hover:text-foreground py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {type === "inventory" ? t("addItemBtn") : t("addSkillBtn")}
              </button>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSortAlpha(category.id)}
                  title={t("sortAlpha")}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "ml-auto size-7")}
                >
                  <ArrowUpAZ className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </SortableContext>}
    </div>
  );
}

// ── Uncategorized droppable section ──────────────────────────────────────────

export function UncategorizedSection({
  items,
  type,
  canEdit,
  canReorder,
  usage,
  showHeader,
  onEditItem,
  onDuplicateItem,
  onDeleteItem,
  onOpenItem,
  onAddIn,
  onSortAlpha,
}: {
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  canReorder: boolean;
  usage: Record<string, number> | null;
  showHeader: boolean;
  onEditItem: (item: CatalogItem) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onOpenItem: (item: CatalogItem) => void;
  onAddIn: (categoryId: string | null) => void;
  onSortAlpha: (categoryId: string | null) => void;
}) {
  const t = useTranslations("catalogue");
  const { setNodeRef, isOver } = useDroppable({ id: UNCAT });

  return (
    <div className="space-y-0.5">
      {showHeader && (
        <div className="px-4 pb-1 pt-3">
          <SectionLabel as="span">
            {t("uncategorized")}
          </SectionLabel>
        </div>
      )}
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[8px] rounded-xl transition-colors",
          isOver && "bg-muted/20",
        )}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <SortableItemRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              canReorder={canReorder}
              usageCount={usage?.[item.id]}
              onEdit={() => onEditItem(item)}
              onDuplicate={() => onDuplicateItem(item.id)}
              onDelete={() => onDeleteItem(item.id)}
              onOpenDetail={() => onOpenItem(item)}
            />
          ))}
        </SortableContext>

        {!showHeader && items.length === 0 && !canEdit && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {type === "inventory" ? t("emptyInventory") : t("emptySkills")}
          </div>
        )}

        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAddIn(null)}
              className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-muted-foreground transition-colors hover:border-ring hover:text-foreground py-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              {showHeader
                ? (type === "inventory" ? t("addItemUncategorized") : t("addSkillUncategorized"))
                : (type === "inventory" ? t("addItemBtn") : t("addSkillBtn"))
              }
            </button>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onSortAlpha(null)}
                title={t("sortAlpha")}
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "ml-auto")}
              >
                <ArrowUpAZ className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add category form ─────────────────────────────────────────────────────────

export function AddCategoryForm({ onAdd, onCancel }: { onAdd: (name: string) => Promise<void>; onCancel: () => void }) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        await onAdd(name.trim());
        setSaving(false);
        setName("");
      }}
      className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2"
    >
      <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t("categoryNamePlaceholder")}
        className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
        maxLength={60}
      />
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className={cn(buttonVariants({ size: "icon-sm" }), "size-6")}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button
        aria-label={tCommon("cancel")}
        type="button"
        onClick={onCancel}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-6")}
      >
        <X className="h-3 w-3" />
      </button>
    </form>
  );
}

// ── Droppable column wrapper ──────────────────────────────────────────────────

export function DroppableColumn({
  id,
  showSplitIndicator = false,
  splitPosition = 0.5,
  colRefCallback,
  children,
}: {
  id: string;
  showSplitIndicator?: boolean;
  splitPosition?: number;
  colRefCallback?: (el: HTMLDivElement | null) => void;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={el => { setNodeRef(el); colRefCallback?.(el); }}
      className={cn(
        "relative flex flex-col min-w-0 rounded-xl transition-colors duration-150",
        isOver && "bg-primary/5",
      )}
    >
      {children}
      {/* Split indicator: vertical line at the future column boundary */}
      <div
        className={cn(
          "pointer-events-none absolute top-2 bottom-2 w-0.5 rounded-full transition-all duration-150 z-10",
          showSplitIndicator ? "bg-primary opacity-100 shadow-[0_0_6px_2px_color-mix(in_oklab,var(--primary)_40%,transparent)]" : "opacity-0",
        )}
        style={{ left: `${splitPosition * 100}%`, transform: "translateX(-50%)" }}
      />
    </div>
  );
}

