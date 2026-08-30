"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Loader2, FolderPlus, } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DragCancelEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { WorldCatalogCategory } from "@/types/worlds";
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
import { UNCAT, COL_PREFIX, groupByColumn, type CatalogType, type CatalogItem } from "./catalogueTypes";

import { CategoryRowOverlay, ItemRowOverlay } from "./CataloguePieces";
import { AddCategoryForm, DroppableColumn, SortableCategoryContainer, UncategorizedSection } from "./CatalogueSections";
import { messageErreurAction } from "@/lib/actionErrors";

// ── Catalogue list (main DnD logic) ──────────────────────────────────────────

// Les réordonnancements du catalogue sont optimistes : la liste bouge avant
// la réponse du serveur. Si l'écriture échoue — refus RLS, coupure réseau —
// on ne peut pas laisser croire qu'elle a réussi : l'ordre affiché
// disparaîtrait au rechargement sans que personne n'ait rien vu.
export function reportSaveFailure(
  promise: Promise<{ ok: boolean; error?: string }>,
  message: string,
) {
  void promise.then((res) => {
    if (!res.ok) toast.error(message, { description: res.error });
  });
}

export function CatalogueList({
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
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
      setItems(prev => [...prev, { ...res.item, category_id: categoryId } as CatalogItem]);
    } else {
      const res = await addWorldSkill(worldId, payload);
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
      setItems(prev => [...prev, { ...res.skill, category_id: categoryId } as CatalogItem]);
    }
    setAddingInCat(false);
  }

  async function handleSaveItem(id: string, data: { name: string; description: string | null; icon: string | null }) {
    if (type === "inventory") {
      const res = await updateWorldInventoryItem(id, data);
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    } else {
      const res = await updateWorldSkill(id, data);
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...data } : i));
    setEditingId(null);
  }

  async function handleDeleteItem(id: string) {
    if (type === "inventory") {
      const res = await deleteWorldInventoryItem(id);
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    } else {
      const res = await deleteWorldSkill(id);
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    }
    setItems(prev => prev.filter(i => i.id !== id));
  }

  // ── Category CRUD ──

  async function handleAddCategory(name: string, colIdx = 0) {
    const sortIdx = categories.filter(c => c.column_index === colIdx).length;
    const res = await addWorldCatalogCategory(worldId, type, name, { column_index: colIdx, sort_index: sortIdx });
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setCategories(prev => [...prev, res.category]);
    setAddingCategoryInCol(false);
  }

  async function handleSaveCategory(id: string, name: string) {
    const res = await updateWorldCatalogCategory(id, { name });
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    setRenamingCatId(null);
  }

  async function handleDeleteCategory(id: string) {
    const res = await deleteWorldCatalogCategory(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
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

