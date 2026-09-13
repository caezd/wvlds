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
import type { WorldCatalogCategory } from "@/types/worlds";
import { UNCAT, type CatalogType, type CatalogItem } from "./catalogueTypes";

import { DragHandle, SortableItemRow } from "./CataloguePieces";

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
  renamingId,
  collapsed,
  onToggleCollapsed,
  onEditItem,
  onDuplicateItem,
  onDeleteItem,
  onOpenItem,
  onAddIn,
  onSetRenaming,
  onDeleteCategory,
  onSaveCategory,
  onSortAlpha,
}: {
  category: WorldCatalogCategory;
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  canReorder: boolean;
  usage: Record<string, number> | null;
  renamingId: string | null;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  onEditItem: (item: CatalogItem) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onOpenItem: (item: CatalogItem) => void;
  /** Ouvre le dialogue de création, dans cette catégorie (`null` : sans). */
  onAddIn: (categoryId: string | null) => void;
  onSetRenaming: (id: string | null) => void;
  onDeleteCategory: (id: string) => void;
  onSaveCategory: (id: string, name: string) => Promise<void>;
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
  const [renameValue, setRenameValue] = useState(category.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const isRenaming = renamingId === category.id;

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
        {isRenaming ? (
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!renameValue.trim()) return;
              setRenameSaving(true);
              await onSaveCategory(category.id, renameValue.trim());
              setRenameSaving(false);
            }}
            className="flex flex-1 items-center gap-2 min-w-0"
          >
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-foreground/80 outline-none"
              maxLength={60}
            />
            <button
              type="submit"
              disabled={!renameValue.trim() || renameSaving}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {renameSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
            <button
              aria-label={tCommon("cancel")}
              type="button"
              onClick={() => { setRenameValue(category.name); onSetRenaming(null); }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </form>
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold text-foreground/70 truncate">{category.name}</span>
            <span
              title={t("itemCount", { count: items.length })}
              className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
            >
              {items.length}
            </span>
            {canEdit && (
              <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                <button
                  aria-label={tCommon("edit")}
                  type="button"
                  onClick={() => { setRenameValue(category.name); onSetRenaming(category.id); }}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  aria-label={tCommon("delete")}
                  type="button"
                  onClick={() => onDeleteCategory(category.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

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
                className="flex flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {type === "inventory" ? t("addItemBtn") : t("addSkillBtn")}
              </button>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSortAlpha(category.id)}
                  title={t("sortAlpha")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
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
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            {t("uncategorized")}
          </span>
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
              className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
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
      <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t("categoryNamePlaceholder")}
        className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
        maxLength={60}
      />
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button
        aria-label={tCommon("cancel")}
        type="button"
        onClick={onCancel}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
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
          showSplitIndicator ? "bg-primary opacity-100 shadow-[0_0_6px_2px_hsl(var(--primary)/0.4)]" : "opacity-0",
        )}
        style={{ left: `${splitPosition * 100}%`, transform: "translateX(-50%)" }}
      />
    </div>
  );
}

