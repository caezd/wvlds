"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DragCancelEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  ImageIcon,
  Loader2,
  Check,
  Library,
  GripVertical,
  FolderPlus,
  ArrowUpAZ,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RpgIconPicker } from "@/components/personas/RpgIconPicker";
import {
  addWorldInventoryItem,
  updateWorldInventoryItem,
  deleteWorldInventoryItem,
  addWorldSkill,
  updateWorldSkill,
  deleteWorldSkill,
  addWorldCatalogCategory,
  updateWorldCatalogCategory,
  deleteWorldCatalogCategory,
  batchUpdateCatalogCategoryOrder,
  batchUpdateCatalogItemOrder,
} from "@/app/actions/worldCatalog";
import type { WorldInventoryItem, WorldSkill, WorldCatalogCategory } from "@/types/worlds";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

type CatalogType = "inventory" | "skills";
type CatalogItem = (WorldInventoryItem | WorldSkill) & { category_id: string | null };

const UNCAT = "__uncat__";
const COL_PREFIX = "col-";

function groupByColumn(cats: WorldCatalogCategory[]): WorldCatalogCategory[][] {
  if (cats.length === 0) return [];
  const maxCol = Math.max(...cats.map(c => c.column_index));
  const buckets: WorldCatalogCategory[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const cat of cats) buckets[cat.column_index]?.push(cat);
  return buckets
    .map(col => [...col].sort((a, b) => a.sort_index - b.sort_index))
    .filter(col => col.length > 0);
}

// ── Icon display ──────────────────────────────────────────────────────────────

function CatalogIcon({ icon, size = "md" }: { icon?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const img = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const px = size === "sm" ? 20 : 24;
  return (
    <div className={cn(dim, "shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40")}>
      {icon ? (
        <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={px} height={px} className={cn(img, "object-contain dark:invert")} />
      ) : (
        <ImageIcon className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", "text-muted-foreground/30")} />
      )}
    </div>
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function DragHandle(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddForm({
  type,
  categoryId,
  onAdd,
  onCancel,
}: {
  type: CatalogType;
  categoryId: string | null;
  onAdd: (data: { name: string; description: string; icon: string | undefined; category_id: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("catalogue");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({ name: name.trim(), description, icon, category_id: categoryId });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3 mt-1">
      <RpgIconPicker
        value={icon}
        onChange={setIcon}
        trigger={
          <button type="button" title={t("chooseIcon")} className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors">
            {icon ? (
              <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </button>
        }
      />
      <div className="flex-1 space-y-1.5 min-w-0">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={type === "inventory" ? t("itemNamePlaceholder") : t("skillNamePlaceholder")}
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
          maxLength={80}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t("descPlaceholder")}
          className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          maxLength={200}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {t("add")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ── Edit row ──────────────────────────────────────────────────────────────────

function EditRow({
  item,
  onSave,
  onCancel,
}: {
  item: CatalogItem;
  onSave: (data: { name: string; description: string | null; icon: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [icon, setIcon] = useState<string | undefined>(item.icon ?? undefined);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), description: description || null, icon: icon ?? null });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-xl border border-primary/30 bg-muted/20 px-3 py-2">
      <RpgIconPicker
        value={icon}
        onChange={setIcon}
        trigger={
          <button type="button" title={t("chooseIcon")} className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors">
            {icon ? (
              <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </button>
        }
      />
      <div className="flex-1 space-y-1 min-w-0">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-transparent text-sm font-medium outline-none"
          maxLength={80}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t("descPlaceholder")}
          className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          maxLength={200}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {tCommon("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ── Sortable item row ─────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  canEdit,
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onCancelEdit,
}: {
  item: CatalogItem;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (data: { name: string; description: string | null; icon: string | null }) => Promise<void>;
  onCancelEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", categoryId: item.category_id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <EditRow item={item} onSave={onSave} onCancel={onCancelEdit} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/item flex items-center gap-2 px-2 py-1"
    >
      {canEdit && <DragHandle {...attributes} {...listeners} />}
      <CatalogIcon icon={item.icon} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Drag overlay renders ──────────────────────────────────────────────────────

function ItemRowOverlay({ item }: { item: CatalogItem }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/95 px-2 py-2 shadow-xl backdrop-blur-sm">
      <GripVertical className="h-4 w-4 w-5 shrink-0 text-muted-foreground/30" />
      <CatalogIcon icon={item.icon} />
      <div className="flex-1 min-w-0 px-1">
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
    </div>
  );
}

function CategoryRowOverlay({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-1.5 shadow-xl backdrop-blur-sm">
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
      <span className="text-sm font-semibold text-foreground/80">{name}</span>
    </div>
  );
}

// ── Sortable category container ───────────────────────────────────────────────

function SortableCategoryContainer({
  category,
  items,
  type,
  canEdit,
  editingId,
  addingHere,
  renamingId,
  onSetEditing,
  onDeleteItem,
  onSaveItem,
  onSetAdding,
  onAddItem,
  onSetRenaming,
  onDeleteCategory,
  onSaveCategory,
  onSortAlpha,
}: {
  category: WorldCatalogCategory;
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  editingId: string | null;
  addingHere: boolean;
  renamingId: string | null;
  onSetEditing: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
  onSaveItem: (id: string, data: { name: string; description: string | null; icon: string | null }) => Promise<void>;
  onSetAdding: (catId: string | null | false) => void;
  onAddItem: (categoryId: string | null, data: { name: string; description: string; icon: string | undefined; category_id: string | null }) => Promise<void>;
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
  const [renameValue, setRenameValue] = useState(category.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const isRenaming = renamingId === category.id;

  return (
    <div ref={setNodeRef} style={style} className="space-y-0.5">
      {/* Category header */}
      <div className="group/cat flex items-center gap-1 rounded-xl px-2 py-1.5">
        {canEdit && <DragHandle {...attributes} {...listeners} />}
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
            {canEdit && (
              <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => { setRenameValue(category.name); onSetRenaming(category.id); }}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
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
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5 min-h-[2px]">
          {items.map(item => (
            <SortableItemRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              isEditing={editingId === item.id}
              onEdit={() => onSetEditing(item.id)}
              onDelete={() => onDeleteItem(item.id)}
              onSave={data => onSaveItem(item.id, data)}
              onCancelEdit={() => onSetEditing(null)}
            />
          ))}

          {addingHere && (
            <AddForm
              type={type}
              categoryId={category.id}
              onAdd={async data => { await onAddItem(category.id, data); }}
              onCancel={() => onSetAdding(false)}
            />
          )}

          {canEdit && !addingHere && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSetAdding(category.id)}
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
      </SortableContext>
    </div>
  );
}

// ── Uncategorized droppable section ──────────────────────────────────────────

function UncategorizedSection({
  items,
  type,
  canEdit,
  editingId,
  addingHere,
  showHeader,
  onSetEditing,
  onDeleteItem,
  onSaveItem,
  onSetAdding,
  onAddItem,
  onSortAlpha,
}: {
  items: CatalogItem[];
  type: CatalogType;
  canEdit: boolean;
  editingId: string | null;
  addingHere: boolean;
  showHeader: boolean;
  onSetEditing: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
  onSaveItem: (id: string, data: { name: string; description: string | null; icon: string | null }) => Promise<void>;
  onSetAdding: (catId: string | null | false) => void;
  onAddItem: (categoryId: string | null, data: { name: string; description: string; icon: string | undefined; category_id: string | null }) => Promise<void>;
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
              isEditing={editingId === item.id}
              onEdit={() => onSetEditing(item.id)}
              onDelete={() => onDeleteItem(item.id)}
              onSave={data => onSaveItem(item.id, data)}
              onCancelEdit={() => onSetEditing(null)}
            />
          ))}
        </SortableContext>

        {!showHeader && items.length === 0 && !addingHere && !canEdit && (
          <div className="py-10 text-center text-sm text-muted-foreground/60">
            {type === "inventory" ? t("emptyInventory") : t("emptySkills")}
          </div>
        )}

        {addingHere && (
          <AddForm
            type={type}
            categoryId={null}
            onAdd={async data => { await onAddItem(null, data); }}
            onCancel={() => onSetAdding(false)}
          />
        )}

        {canEdit && !addingHere && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSetAdding(null)}
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

function AddCategoryForm({ onAdd, onCancel }: { onAdd: (name: string) => Promise<void>; onCancel: () => void }) {
  const t = useTranslations("catalogue");
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

function DroppableColumn({
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

// ── Catalogue list (main DnD logic) ──────────────────────────────────────────

// Les réordonnancements du catalogue sont optimistes : la liste bouge avant
// la réponse du serveur. Si l'écriture échoue — refus RLS, coupure réseau —
// on ne peut pas laisser croire qu'elle a réussi : l'ordre affiché
// disparaîtrait au rechargement sans que personne n'ait rien vu.
function reportSaveFailure(
  promise: Promise<{ ok: boolean; error?: string }>,
  message: string,
) {
  void promise.then((res) => {
    if (!res.ok) toast.error(message, { description: res.error });
  });
}

function CatalogueList({
  type,
  worldId,
  canEdit,
}: {
  type: CatalogType;
  worldId: string;
  canEdit: boolean;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const [categories, setCategories] = useState<WorldCatalogCategory[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // false = not adding; null = adding in uncategorized; string = adding in that category
  const [addingInCat, setAddingInCat] = useState<string | null | false>(false);
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [addingCategoryInCol, setAddingCategoryInCol] = useState<number | false>(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      const itemTable = type === "inventory" ? "world_inventory_items" : "world_skills";
      const [catRes, itemRes] = await Promise.all([
        (supabase as ReturnType<typeof createClient>)
          .from("world_catalog_categories")
          .select("id, world_id, type, name, sort_index, column_index")
          .eq("world_id", worldId)
          .eq("type", type)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
        (supabase as ReturnType<typeof createClient>)
          .from(itemTable)
          .select("id, world_id, name, description, icon, sort_index, category_id")
          .eq("world_id", worldId)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      setCategories((catRes as { data: WorldCatalogCategory[] | null }).data ?? []);
      setItems(((itemRes as { data: CatalogItem[] | null }).data ?? []).map(i => ({
        ...i,
        category_id: (i as unknown as Record<string, unknown>).category_id as string | null ?? null,
      })));
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, type]);

  // ── Item CRUD ──

  async function handleAddItem(
    categoryId: string | null,
    data: { name: string; description: string; icon: string | undefined; category_id: string | null },
  ) {
    const payload = { name: data.name, description: data.description || undefined, icon: data.icon, category_id: categoryId };
    if (type === "inventory") {
      const res = await addWorldInventoryItem(worldId, payload);
      if (!res.ok) { toast.error(res.error); return; }
      setItems(prev => [...prev, { ...res.item, category_id: categoryId } as CatalogItem]);
    } else {
      const res = await addWorldSkill(worldId, payload);
      if (!res.ok) { toast.error(res.error); return; }
      setItems(prev => [...prev, { ...res.skill, category_id: categoryId } as CatalogItem]);
    }
    setAddingInCat(false);
  }

  async function handleSaveItem(id: string, data: { name: string; description: string | null; icon: string | null }) {
    if (type === "inventory") {
      const res = await updateWorldInventoryItem(id, data);
      if (!res.ok) { toast.error(res.error); return; }
    } else {
      const res = await updateWorldSkill(id, data);
      if (!res.ok) { toast.error(res.error); return; }
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...data } : i));
    setEditingId(null);
  }

  async function handleDeleteItem(id: string) {
    if (type === "inventory") {
      const res = await deleteWorldInventoryItem(id);
      if (!res.ok) { toast.error(res.error); return; }
    } else {
      const res = await deleteWorldSkill(id);
      if (!res.ok) { toast.error(res.error); return; }
    }
    setItems(prev => prev.filter(i => i.id !== id));
  }

  // ── Category CRUD ──

  async function handleAddCategory(name: string, colIdx = 0) {
    const sortIdx = categories.filter(c => c.column_index === colIdx).length;
    const res = await addWorldCatalogCategory(worldId, type, name, { column_index: colIdx, sort_index: sortIdx });
    if (!res.ok) { toast.error(res.error); return; }
    setCategories(prev => [...prev, res.category]);
    setAddingCategoryInCol(false);
  }

  async function handleSaveCategory(id: string, name: string) {
    const res = await updateWorldCatalogCategory(id, { name });
    if (!res.ok) { toast.error(res.error); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    setRenamingCatId(null);
  }

  async function handleDeleteCategory(id: string) {
    const res = await deleteWorldCatalogCategory(id);
    if (!res.ok) { toast.error(res.error); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    // ON DELETE SET NULL handles DB; mirror locally
    setItems(prev => prev.map(i => i.category_id === id ? { ...i, category_id: null } : i));
  }

  // ── Sort alpha ──

  function handleSortAlpha(categoryId: string | null) {
    const catItems = items.filter(i => i.category_id === categoryId);
    if (catItems.length < 2) return;
    const sorted = [...catItems].sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
    );
    const reindexed = sorted.map((item, idx) => ({ ...item, sort_index: idx }));
    setItems(prev => [...prev.filter(i => i.category_id !== categoryId), ...reindexed]);
    reportSaveFailure(batchUpdateCatalogItemOrder(
      reindexed.map(item => ({ id: item.id, sort_index: item.sort_index, category_id: categoryId })),
      type,
    ), tCommon("saveError"));
  }

  // ── DnD ──

  const dragStartCategoryRef = useRef<string | null>(null);
  const [splitAfterCol, setSplitAfterCol] = useState<number | null>(null);
  const colRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  function resolveCategoryId(overId: string): string | null | undefined {
    if (overId === UNCAT) return null;
    if (categories.some(c => c.id === overId)) return overId;
    return items.find(i => i.id === overId)?.category_id;
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string);
    if (active.data.current?.type === "item") {
      dragStartCategoryRef.current = items.find(i => i.id === active.id)?.category_id ?? null;
    }
  }

  // Detect split zone (right 40% of a column) for category drags via pointer position
  function onDragMove({ activatorEvent, delta }: DragMoveEvent) {
    const isDraggingCat = activeDragId !== null && categories.some(c => c.id === activeDragId);
    const nCols = groupByColumn(categories).length;
    if (!isDraggingCat || nCols >= 3) {
      if (splitAfterCol !== null) setSplitAfterCol(null);
      return;
    }
    const startX = (activatorEvent as PointerEvent).clientX ?? 0;
    const currentX = startX + delta.x;
    // Threshold scales with column count: 50% for 1 col, 67% for 2 cols
    const splitThreshold = 1 - 1 / (nCols + 1);

    let found: number | null = null;
    for (const [colIdx, el] of colRefs.current) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (currentX >= rect.left + rect.width * splitThreshold && currentX <= rect.right + 60) {
        found = colIdx;
        break;
      }
    }
    if (found !== splitAfterCol) setSplitAfterCol(found);
  }

  // Cross-category item preview only — no server calls here
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.data.current?.type !== "item") return;
    const targetCategoryId = resolveCategoryId(over.id as string);
    if (targetCategoryId === undefined) return;
    const activeItem = items.find(i => i.id === active.id);
    if (!activeItem || activeItem.category_id === targetCategoryId) return;
    setItems(prev => prev.map(i => i.id === active.id ? { ...i, category_id: targetCategoryId } : i));
  }

  function onDragCancel(_e: DragCancelEvent) {
    setActiveDragId(null);
    setSplitAfterCol(null);
    dragStartCategoryRef.current = null;
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    if (!over) return;

    const activeType = active.data.current?.type as string | undefined;

    if (activeType === "category") {
      const overId = over.id as string;
      const activeIdStr = active.id as string;
      const activeCat = categories.find(c => c.id === activeIdStr);
      if (!activeCat) { setSplitAfterCol(null); return; }
      const origColIdx = activeCat.column_index;

      // ── Split: create new column to the right of splitAfterCol ──
      if (splitAfterCol !== null) {
        const splitIdx = splitAfterCol;
        setSplitAfterCol(null);
        const newColIdx = splitIdx + 1;
        const raw = categories.map(c => {
          if (c.id === activeIdStr) return { ...c, column_index: newColIdx, sort_index: 0 };
          if (c.column_index >= newColIdx) return { ...c, column_index: c.column_index + 1 };
          return c;
        });
        const distinctCols = [...new Set(raw.map(c => c.column_index))].sort((a, b) => a - b);
        const colMap = new Map(distinctCols.map((col, i) => [col, i]));
        const next = raw.map(c => ({ ...c, column_index: colMap.get(c.column_index)! }));
        setCategories(next);
        reportSaveFailure(batchUpdateCatalogCategoryOrder(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
        return;
      }

      if (activeIdStr === overId) return;

      // ── Dropped on a column zone: move to that column (append) ──
      if (overId.startsWith(COL_PREFIX)) {
        const targetColIdx = parseInt(overId.slice(COL_PREFIX.length), 10);
        if (targetColIdx === origColIdx) return;
        const targetCats = categories
          .filter(c => c.column_index === targetColIdx)
          .sort((a, b) => a.sort_index - b.sort_index);
        const updatedActive = { ...activeCat, column_index: targetColIdx, sort_index: targetCats.length };
        const others = categories.filter(c => c.id !== activeIdStr);
        const raw = [...others, updatedActive];
        const distinctCols = [...new Set(raw.map(c => c.column_index))].sort((a, b) => a - b);
        const colMap = new Map(distinctCols.map((col, i) => [col, i]));
        const next = raw.map(c => ({ ...c, column_index: colMap.get(c.column_index)! }));
        setCategories(next);
        reportSaveFailure(batchUpdateCatalogCategoryOrder(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
        return;
      }

      // ── Dropped on a category ──
      const overCat = categories.find(c => c.id === overId);
      if (!overCat) return;
      const targetColIdx = overCat.column_index;

      if (origColIdx === targetColIdx) {
        // Within-column reorder
        const colCats = categories
          .filter(c => c.column_index === targetColIdx)
          .sort((a, b) => a.sort_index - b.sort_index);
        const fromIdx = colCats.findIndex(c => c.id === activeIdStr);
        const toIdx = colCats.findIndex(c => c.id === overId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const reordered = arrayMove(colCats, fromIdx, toIdx).map((c, i) => ({ ...c, sort_index: i }));
        const next = [...categories.filter(c => c.column_index !== targetColIdx), ...reordered];
        setCategories(next);
        reportSaveFailure(batchUpdateCatalogCategoryOrder(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
      } else {
        // Cross-column move: insert before overCat in target column
        const updatedActive = { ...activeCat, column_index: targetColIdx };
        const targetWithout = categories
          .filter(c => c.column_index === targetColIdx && c.id !== activeIdStr)
          .sort((a, b) => a.sort_index - b.sort_index);
        const insertAt = targetWithout.findIndex(c => c.id === overId);
        const newTargetCats = insertAt >= 0
          ? [...targetWithout.slice(0, insertAt), updatedActive, ...targetWithout.slice(insertAt)]
          : [...targetWithout, updatedActive];
        const reindexedTarget = newTargetCats.map((c, i) => ({ ...c, sort_index: i }));
        const reindexedSource = categories
          .filter(c => c.column_index === origColIdx && c.id !== activeIdStr)
          .sort((a, b) => a.sort_index - b.sort_index)
          .map((c, i) => ({ ...c, sort_index: i }));
        const others = categories.filter(
          c => c.column_index !== targetColIdx && c.column_index !== origColIdx,
        );
        const raw = [...others, ...reindexedTarget, ...reindexedSource];
        const distinctCols = [...new Set(raw.map(c => c.column_index))].sort((a, b) => a - b);
        const colMap = new Map(distinctCols.map((col, i) => [col, i]));
        const next = raw.map(c => ({ ...c, column_index: colMap.get(c.column_index)! }));
        setCategories(next);
        reportSaveFailure(batchUpdateCatalogCategoryOrder(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
      }
      return;
    }

    if (activeType === "item") {
      const overId = over.id as string;
      const origCategoryId = dragStartCategoryRef.current;
      dragStartCategoryRef.current = null;

      const targetCategoryId = resolveCategoryId(overId);
      if (targetCategoryId === undefined) return;

      const activeItem = items.find(i => i.id === active.id);
      if (!activeItem) return;

      const sameCategory = origCategoryId === targetCategoryId;

      if (sameCategory) {
        // Within-category reorder: onDragOver didn't change state, use arrayMove
        const catItems = items.filter(i => i.category_id === targetCategoryId);
        const fromIdx = catItems.findIndex(i => i.id === active.id);
        const toIdx = catItems.findIndex(i => i.id === overId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

        const reordered = arrayMove(catItems, fromIdx, toIdx);
        setItems([...items.filter(i => i.category_id !== targetCategoryId), ...reordered]);
        reportSaveFailure(batchUpdateCatalogItemOrder(
          reordered.map((item, idx) => ({ id: item.id, sort_index: idx, category_id: targetCategoryId })),
          type,
        ), tCommon("saveError"));
      } else {
        // Cross-category: onDragOver may have already moved the item in state.
        // Rebuild target list explicitly (always exclude active item) to stay idempotent.
        const updatedActive = { ...activeItem, category_id: targetCategoryId };
        const targetWithout = items.filter(i => i.category_id === targetCategoryId && i.id !== active.id);
        const insertAt = targetWithout.findIndex(i => i.id === overId);

        const newTargetItems = insertAt >= 0
          ? [...targetWithout.slice(0, insertAt), updatedActive, ...targetWithout.slice(insertAt)]
          : [...targetWithout, updatedActive];

        const rest = items.filter(i => i.category_id !== targetCategoryId && i.id !== active.id);
        setItems([...rest, ...newTargetItems]);

        reportSaveFailure(batchUpdateCatalogItemOrder(
          newTargetItems.map((item, idx) => ({ id: item.id, sort_index: idx, category_id: targetCategoryId })),
          type,
        ), tCommon("saveError"));
        const sourceItems = rest.filter(i => i.category_id === origCategoryId);
        reportSaveFailure(batchUpdateCatalogItemOrder(
          sourceItems.map((item, idx) => ({ id: item.id, sort_index: idx, category_id: origCategoryId })),
          type,
        ), tCommon("saveError"));
      }
    }
  }

  // ── Derived ──

  const hasCategories = categories.length > 0;
  const uncatItems = items.filter(i => i.category_id === null || !categories.some(c => c.id === i.category_id));
  const activeItem = activeDragId ? (items.find(i => i.id === activeDragId) ?? null) : null;
  const activeCategory = activeDragId ? (categories.find(c => c.id === activeDragId) ?? null) : null;
  const columnGroups = groupByColumn(categories);
  const numColumns = columnGroups.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* Categories — responsive columns */}
        {hasCategories && (
          <div className={cn(
            "grid gap-x-4 items-start",
            numColumns === 2 && "grid-cols-1 sm:grid-cols-2",
            numColumns === 3 && "grid-cols-1 sm:grid-cols-3",
          )}>
            {columnGroups.map((colCats, colIdx) => (
              <DroppableColumn
                key={colIdx}
                id={`${COL_PREFIX}${colIdx}`}
                showSplitIndicator={splitAfterCol === colIdx && numColumns < 3}
                splitPosition={1 - 1 / (numColumns + 1)}
                colRefCallback={el => colRefs.current.set(colIdx, el)}
              >
                <SortableContext items={colCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {colCats.map(cat => (
                    <SortableCategoryContainer
                      key={cat.id}
                      category={cat}
                      items={items.filter(i => i.category_id === cat.id)}
                      type={type}
                      canEdit={canEdit}
                      editingId={editingId}
                      addingHere={addingInCat === cat.id}
                      renamingId={renamingCatId}
                      onSetEditing={setEditingId}
                      onDeleteItem={id => void handleDeleteItem(id)}
                      onSaveItem={handleSaveItem}
                      onSetAdding={setAddingInCat}
                      onAddItem={handleAddItem}
                      onSetRenaming={setRenamingCatId}
                      onDeleteCategory={id => void handleDeleteCategory(id)}
                      onSaveCategory={handleSaveCategory}
                      onSortAlpha={handleSortAlpha}
                    />
                  ))}
                </SortableContext>

                {/* Add category in this column */}
                {canEdit && (
                  <div className="mt-1">
                    {addingCategoryInCol === colIdx ? (
                      <AddCategoryForm
                        onAdd={name => handleAddCategory(name, colIdx)}
                        onCancel={() => setAddingCategoryInCol(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingCategoryInCol(colIdx)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        {t("createCategory")}
                      </button>
                    )}
                  </div>
                )}
              </DroppableColumn>
            ))}

          </div>
        )}

        {/* Uncategorized / flat list when no categories */}
        {(!hasCategories || uncatItems.length > 0 || addingInCat === null || canEdit) && (
          <UncategorizedSection
            items={uncatItems}
            type={type}
            canEdit={canEdit}
            editingId={editingId}
            addingHere={addingInCat === null}
            showHeader={hasCategories}
            onSetEditing={setEditingId}
            onDeleteItem={id => void handleDeleteItem(id)}
            onSaveItem={handleSaveItem}
            onSetAdding={setAddingInCat}
            onAddItem={handleAddItem}
            onSortAlpha={handleSortAlpha}
          />
        )}

        {/* Add first category (when no columns exist yet) */}
        {canEdit && !hasCategories && (
          <div className="pt-3 border-t border-border-soft mt-3">
            {addingCategoryInCol === 0 ? (
              <AddCategoryForm
                onAdd={name => handleAddCategory(name, 0)}
                onCancel={() => setAddingCategoryInCol(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategoryInCol(0)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Créer une catégorie
              </button>
            )}
          </div>
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {activeItem && <ItemRowOverlay item={activeItem} />}
          {activeCategory && <CategoryRowOverlay name={activeCategory.name} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Faceclaims (annuaire en lecture seule) ────────────────────────────────────

type FaceclaimRow = { id: string; name: string; avatar_url: string | null; faceclaim: string };

function FaceclaimList({ worldId }: { worldId: string }) {
  const t = useTranslations("catalogue");
  const [rows, setRows] = useState<FaceclaimRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("personas")
        .select("id, name, avatar_url, faceclaim")
        .eq("world_id", worldId)
        .not("faceclaim", "is", null)
        .neq("faceclaim", "");
      const sorted = ((data ?? []) as FaceclaimRow[])
        .filter(p => !!p.faceclaim?.trim())
        .sort((a, b) => a.faceclaim.localeCompare(b.faceclaim, "fr", { sensitivity: "base" }));
      setRows(sorted);
      setLoading(false);
    }
    void load();
  }, [worldId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground/60">
        {t("emptyFaceclaims")}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows.map(p => (
        <div key={p.id} className="flex items-center gap-2 px-2 py-1.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
            {p.avatar_url ? (
              <Image src={p.avatar_url} alt="" fill sizes="32px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug truncate">{p.faceclaim}</p>
            <p className="text-xs text-muted-foreground truncate">{p.name}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── WorldCatalogue ────────────────────────────────────────────────────────────

export type WorldCatalogueProps = {
  worldId: string;
  canEdit: boolean;
  inventoryEnabled: boolean;
  inventoryRestricted: boolean;
  skillsEnabled: boolean;
  skillsRestricted: boolean;
  faceclaimsEnabled: boolean;
};

export function WorldCatalogue({ worldId, canEdit, inventoryEnabled, inventoryRestricted, skillsEnabled, skillsRestricted, faceclaimsEnabled }: WorldCatalogueProps) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [editMode, setEditMode] = useState(false);
  const defaultTab = inventoryEnabled ? "inventory" : "skills";

  const inactiveLines: string[] = [];
  if (!inventoryEnabled) inactiveLines.push(t("itemsDisabled"));
  else if (!inventoryRestricted) inactiveLines.push(t("itemsUnrestricted"));
  if (!skillsEnabled) inactiveLines.push(t("skillsDisabled"));
  else if (!skillsRestricted) inactiveLines.push(t("skillsUnrestricted"));
  const inactiveNote = inactiveLines.length > 0 ? inactiveLines.join(" · ") : null;

  return (
    <div className="flex h-full w-full flex-col">
      <WorldPanelHeader
        icon={<Library className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          canEdit && (
            <button
              type="button"
              onClick={() => setEditMode(v => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                editMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
              {editMode ? t("editingActive") : tCommon("edit")}
            </button>
          )
        }
      />

      {/* Body — always show both tabs for editors */}
      <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border-soft px-4 pt-3">
          <TabsList className="h-8 rounded-lg p-0.5">
            <TabsTrigger value="inventory" className="h-7 px-3 text-xs">{t("items")}</TabsTrigger>
            <TabsTrigger value="skills" className="h-7 px-3 text-xs">{t("skills")}</TabsTrigger>
            {faceclaimsEnabled && (
              <TabsTrigger value="faceclaims" className="h-7 px-3 text-xs">{t("faceclaims")}</TabsTrigger>
            )}
          </TabsList>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="inventory" className="mt-0">
            <CatalogueList type="inventory" worldId={worldId} canEdit={canEdit && editMode} />
          </TabsContent>
          {faceclaimsEnabled && (
            <TabsContent value="faceclaims" className="mt-0">
              <FaceclaimList worldId={worldId} />
            </TabsContent>
          )}
          <TabsContent value="skills" className="mt-0">
            <CatalogueList type="skills" worldId={worldId} canEdit={canEdit && editMode} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer: note when catalogue is not fully active */}
      {inactiveNote && (
        <div className="shrink-0 flex justify-end border-t border-border-soft px-4 py-2">
          <span className="text-xs text-muted-foreground/50">{inactiveNote}</span>
        </div>
      )}
    </div>
  );
}
