"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X, Plus, Pencil, Trash2, Loader2, Check, FolderPlus, ArrowUpAZ, ChevronRight, ChevronLeft,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
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
import { buttonVariants } from "@/components/ui/button";

// Les colonnes du tableau : une par catégorie, celle des objets sans
// catégorie, et celle qui en crée une.

/** Une colonne du tableau : largeur fixe, fond discret, cartes empilées. */
const COLUMN = "flex min-h-0 w-72 shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/30";

type ItemHandlers = {
  usage: Record<string, number> | null;
  onEditItem: (item: CatalogItem) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onOpenItem: (item: CatalogItem) => void;
};

/** Les cartes d'une colonne, triables, et son pied : ajouter, trier. */
function ColumnCards({
  items,
  type,
  canEdit,
  canReorder,
  categoryId,
  handlers,
  onAddIn,
  onSortAlpha,
}: {
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  canReorder: boolean;
  categoryId: string | null;
  handlers: ItemHandlers;
  onAddIn: (categoryId: string | null) => void;
  onSortAlpha: (categoryId: string | null) => void;
}) {
  const t = useTranslations("catalogue");
  return (
    <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
      <div className="flex min-h-12 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
        {items.map(item => (
          <SortableItemRow
            key={item.id}
            item={item}
            canEdit={canEdit}
            canReorder={canReorder}
            usageCount={handlers.usage?.[item.id]}
            onEdit={() => handlers.onEditItem(item)}
            onDuplicate={() => handlers.onDuplicateItem(item.id)}
            onDelete={() => handlers.onDeleteItem(item.id)}
            onOpenDetail={() => handlers.onOpenItem(item)}
          />
        ))}

        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAddIn(categoryId)}
              className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {type === "inventory" ? t("addItemBtn") : t("addSkillBtn")}
            </button>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onSortAlpha(categoryId)}
                title={t("sortAlpha")}
                aria-label={t("sortAlpha")}
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-7")}
              >
                <ArrowUpAZ className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </SortableContext>
  );
}

/** Le compte d'objets d'une colonne. */
function CountPill({ count }: { count: number }) {
  const t = useTranslations("catalogue");
  return (
    <span
      title={t("itemCount", { count })}
      className="shrink-0 rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground"
    >
      {count}
    </span>
  );
}

// ── Colonne d'une catégorie ───────────────────────────────────────────────────

/**
 * Une catégorie, en colonne du tableau.
 *
 * Elle se glisse par sa poignée pour changer de place, et reçoit les cartes
 * lâchées sur elle. Repliée — une préférence de lecture, pour tout le monde —
 * elle n'est plus qu'une bande étroite, son nom à la verticale et son compte
 * d'objets ; elle reste une cible de dépôt.
 */
export function CategoryColumn({
  category,
  items,
  type,
  canEdit,
  canReorder,
  collapsed,
  onToggleCollapsed,
  onAddIn,
  onEditCategory,
  onDeleteCategory,
  onSortAlpha,
  ...handlers
}: ItemHandlers & {
  category: WorldCatalogCategory;
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  canReorder: boolean;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
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
    disabled: !canReorder,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const hasPresentation = !!category.banner_url || !!category.description;
  const toggleLabel = collapsed
    ? t("expandCategory", { name: category.name })
    : t("collapseCategory", { name: category.name });

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        style={style}
        aria-label={category.name}
        className="flex w-11 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 py-2"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label={toggleLabel}
          onClick={() => onToggleCollapsed(category.id)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <CountPill count={items.length} />
        <span className="text-sm font-semibold text-muted-foreground [writing-mode:vertical-rl]">{category.name}</span>
      </section>
    );
  }

  return (
    <section ref={setNodeRef} style={style} aria-label={category.name} className={COLUMN}>
      <div className="group/cat flex items-center gap-1 px-2 py-2">
        {canReorder && <DragHandle {...attributes} {...listeners} aria-label={t("moveCategory", { name: category.name })} />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{category.name}</span>
        <CountPill count={items.length} />
        {canEdit && (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/cat:opacity-100">
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
        <button
          type="button"
          aria-expanded
          aria-label={toggleLabel}
          onClick={() => onToggleCollapsed(category.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* La présentation de la catégorie, bannière puis description. */}
      {hasPresentation && (
        <div className="mx-2 mb-2 space-y-2" data-testid="category-presentation">
          {category.banner_url && (
            <div className="relative h-20 w-full overflow-hidden rounded-lg">
              <StoredImage url={category.banner_url} width={576} height={160} alt="" className="object-cover" draggable={false} />
            </div>
          )}
          {category.description && (
            <MarkdownRenderer content={category.description} className="px-1 text-xs text-muted-foreground prose-sm" />
          )}
        </div>
      )}

      <ColumnCards
        items={items}
        type={type}
        canEdit={canEdit}
        canReorder={canReorder}
        categoryId={category.id}
        handlers={handlers}
        onAddIn={onAddIn}
        onSortAlpha={onSortAlpha}
      />
    </section>
  );
}

// ── Colonne des objets sans catégorie ────────────────────────────────────────

export function UncategorizedColumn({
  items,
  type,
  canEdit,
  canReorder,
  titled,
  onAddIn,
  onSortAlpha,
  ...handlers
}: ItemHandlers & {
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  canReorder: boolean;
  /** Titrée « Sans catégorie » à côté d'autres colonnes ; seule, elle n'a pas de titre. */
  titled: boolean;
  onAddIn: (categoryId: string | null) => void;
  onSortAlpha: (categoryId: string | null) => void;
}) {
  const t = useTranslations("catalogue");
  const { setNodeRef, isOver } = useDroppable({ id: UNCAT });
  const label = titled ? t("uncategorized") : type === "inventory" ? t("items") : t("skills");

  return (
    <section ref={setNodeRef} aria-label={label} className={cn(COLUMN, isOver && "border-primary/40")}>
      <div className="flex items-center gap-1 px-3 py-2">
        <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", titled && "text-muted-foreground")}>{label}</span>
        <CountPill count={items.length} />
      </div>
      {items.length === 0 && !canEdit && (
        <p className="px-3 pb-4 text-sm text-muted-foreground">
          {type === "inventory" ? t("emptyInventory") : t("emptySkills")}
        </p>
      )}
      <ColumnCards
        items={items}
        type={type}
        canEdit={canEdit}
        canReorder={canReorder}
        categoryId={null}
        handlers={handlers}
        onAddIn={onAddIn}
        onSortAlpha={onSortAlpha}
      />
    </section>
  );
}

// ── Colonne qui crée une catégorie ───────────────────────────────────────────

export function AddCategoryColumn({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-72 shrink-0 snap-start items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
      >
        <FolderPlus className="h-4 w-4" />
        {t("createCategory")}
      </button>
    );
  }

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        await onAdd(name.trim());
        setSaving(false);
        setName("");
        setOpen(false);
      }}
      className="flex w-72 shrink-0 snap-start items-center gap-2 self-start rounded-xl border border-dashed border-border px-3 py-2"
    >
      <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t("categoryNamePlaceholder")}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
        maxLength={60}
      />
      <button
        type="submit"
        aria-label={t("createCategory")}
        disabled={!name.trim() || saving}
        className={cn(buttonVariants({ size: "icon-sm" }), "size-6")}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button
        aria-label={tCommon("cancel")}
        type="button"
        onClick={() => { setOpen(false); setName(""); }}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-6")}
      >
        <X className="h-3 w-3" />
      </button>
    </form>
  );
}
