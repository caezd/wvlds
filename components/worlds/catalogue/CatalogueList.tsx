"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, FolderPlus, Search, Download, Upload, X } from "lucide-react";
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
  addWorldCatalogItem,
  updateWorldCatalogItem,
  deleteWorldCatalogItem,
  duplicateWorldCatalogItem,
  addWorldCatalogCategory,
  updateWorldCatalogCategory,
  deleteWorldCatalogCategory,
  reorderWorldCatalogCategories,
  reorderWorldCatalogItems,
  getWorldCatalogUsage,
  importWorldCatalogItems,
  type CatalogItemInput,
} from "@/app/actions/worldCatalog";
import {
  buildCatalogExport,
  catalogItemMatches,
  normalizeForSearch,
  parseCatalogImport,
} from "@/lib/worldCatalog";
import { UNCAT, COL_PREFIX, groupByColumn, type CatalogType, type CatalogItem } from "./catalogueTypes";

import { CategoryRowOverlay, ItemRowOverlay } from "./CataloguePieces";
import { CatalogItemDetail, CatalogItemDialog } from "./CatalogItemDialog";
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
  const [search, setSearch] = useState("");
  /** Nombre de personas portant chaque objet ; `null` tant qu'on ne sait pas. */
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [importing, setImporting] = useState(false);
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
      const [catRes, itemRes] = await Promise.all([
        (supabase as ReturnType<typeof createClient>)
          .from("world_catalog_categories")
          .select("id, world_id, type, name, sort_index, column_index")
          .eq("world_id", worldId)
          .eq("type", type)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
        (supabase as ReturnType<typeof createClient>)
          .from("world_catalog_items")
          .select("id, world_id, type, name, description, icon, image_url, rarity, stackable, max_quantity, properties, sort_index, category_id")
          .eq("world_id", worldId)
          .eq("type", type)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      setCategories((catRes as { data: WorldCatalogCategory[] | null }).data ?? []);
      setItems(((itemRes as { data: CatalogItem[] | null }).data ?? []).map(i => ({
        ...i,
        category_id: i.category_id ?? null,
      })));
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, type]);

  /**
   * Le décompte d'usage, à part du chargement principal.
   *
   * Il balaie le JSONB de toutes les fiches du monde ; le catalogue, lui, se
   * lit sur un index. Les attendre ensemble ferait patienter la liste pour un
   * chiffre qui ne s'affiche qu'à côté du nom.
   */
  useEffect(() => {
    let cancelled = false;
    void getWorldCatalogUsage(worldId).then(res => {
      if (!cancelled && res.ok) setUsage(res.usage);
    });
    return () => { cancelled = true; };
  }, [worldId, type]);

  // ── Item CRUD ──

  async function handleAddItem(
    categoryId: string | null,
    data: { name: string; description: string; icon: string | undefined; category_id: string | null },
  ) {
    const res = await addWorldCatalogItem(worldId, type, {
      name: data.name,
      description: data.description || null,
      icon: data.icon ?? null,
      category_id: categoryId,
    });
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setItems(prev => [...prev, { ...res.item, category_id: categoryId } as CatalogItem]);
  }

  async function handleSaveItem(id: string, data: CatalogItemInput) {
    const res = await updateWorldCatalogItem(id, data);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...data } : i)));
    setEditingItem(null);
  }

  async function handleDuplicateItem(id: string) {
    const res = await duplicateWorldCatalogItem(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    // Juste après l'original : `sort_index` le place déjà, le tri d'affichage
    // s'en charge au prochain rendu.
    setItems(prev => [...prev, { ...res.item, category_id: res.item.category_id ?? null } as CatalogItem]);
  }

  async function handleDeleteItem(id: string) {
    const res = await deleteWorldCatalogItem(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  }

  // ── Export et import ──

  /**
   * Le catalogue dans un fichier, et retour.
   *
   * L'export sert autant à repartir d'un monde existant qu'à garder une copie
   * hors de l'application. L'import AJOUTE : il ne remplace rien, et recrée au
   * besoin les catégories que le fichier nomme.
   */
  function handleExport() {
    const names = new Map(categories.map(c => [c.id, c.name]));
    const payload = buildCatalogExport(type, items, names);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type === "inventory" ? "objets" : "competences"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const parsed = parseCatalogImport(await file.text(), type);
      if (!parsed.ok) { toast.error(t(`importError_${parsed.reason}`)); return; }

      const res = await importWorldCatalogItems(worldId, type, parsed.items);
      if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }

      // Les catégories ont pu naître de l'import : on les relit plutôt que de
      // les deviner, l'action ne rend que les objets.
      const { data } = await (supabase as ReturnType<typeof createClient>)
        .from("world_catalog_categories")
        .select("id, world_id, type, name, sort_index, column_index")
        .eq("world_id", worldId)
        .eq("type", type)
        .order("sort_index", { ascending: true });
      setCategories((data as WorldCatalogCategory[] | null) ?? []);
      setItems(prev => [...prev, ...res.items.map(i => ({ ...i, category_id: i.category_id ?? null }) as CatalogItem)]);
      toast.success(t("importDone", { count: res.items.length }));
    } finally {
      setImporting(false);
    }
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
    reportSaveFailure(reorderWorldCatalogItems(
      reindexed.map(item => ({ id: item.id, sort_index: item.sort_index, category_id: categoryId })),
    ), tCommon("saveError"));
  }

  // ── DnD ──

  const importInputRef = useRef<HTMLInputElement>(null);
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
        reportSaveFailure(reorderWorldCatalogCategories(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
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
        reportSaveFailure(reorderWorldCatalogCategories(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
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
        reportSaveFailure(reorderWorldCatalogCategories(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
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
        reportSaveFailure(reorderWorldCatalogCategories(next.map(c => ({ id: c.id, sort_index: c.sort_index, column_index: c.column_index }))), tCommon("saveError"));
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
        reportSaveFailure(reorderWorldCatalogItems(
          reordered.map((item, idx) => ({ id: item.id, sort_index: idx, category_id: targetCategoryId })),
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

        reportSaveFailure(reorderWorldCatalogItems(
          newTargetItems.map((item, idx) => ({ id: item.id, sort_index: idx, category_id: targetCategoryId })),
        ), tCommon("saveError"));
        const sourceItems = rest.filter(i => i.category_id === origCategoryId);
        reportSaveFailure(reorderWorldCatalogItems(
          sourceItems.map((item, idx) => ({ id: item.id, sort_index: idx, category_id: origCategoryId })),
        ), tCommon("saveError"));
      }
    }
  }

  // ── Derived ──

  // La recherche filtre l'affichage, jamais l'état : `items` reste la liste
  // complète, sur laquelle portent les écritures. Déplacer un objet dans une
  // liste filtrée réécrirait en revanche des rangs qu'on ne voit pas — le
  // glisser-déposer est donc suspendu tant qu'une recherche est active.
  const normalizedQuery = normalizeForSearch(search.trim());
  const searching = normalizedQuery.length > 0;
  const visibleItems = searching ? items.filter(i => catalogItemMatches(i, normalizedQuery)) : items;
  const canReorder = canEdit && !searching;

  const hasCategories = categories.length > 0;
  const uncatItems = visibleItems.filter(i => i.category_id === null || !categories.some(c => c.id === i.category_id));
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
      {/* Barre d'outils : chercher, exporter, importer */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tCommon("search")}
            aria-label={tCommon("search")}
            className="h-8 w-full rounded-lg border border-border-soft bg-background pl-8 pr-8 text-xs outline-none transition-colors focus:border-primary/40"
          />
          {search && (
            <button
              type="button"
              aria-label={tCommon("close")}
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={items.length === 0}
          title={t("exportCatalog")}
          aria-label={t("exportCatalog")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-soft text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
        </button>

        {canEdit && (
          <>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImport(file);
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              title={t("importCatalog")}
              aria-label={t("importCatalog")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-soft text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>

      {searching && visibleItems.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
      )}

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
                  {colCats
                    .filter(cat => !searching || visibleItems.some(i => i.category_id === cat.id))
                    .map(cat => (
                    <SortableCategoryContainer
                      key={cat.id}
                      category={cat}
                      items={visibleItems.filter(i => i.category_id === cat.id)}
                      type={type}
                      canEdit={canEdit}
                      canReorder={canReorder}
                      usage={usage}
                      addingHere={addingInCat === cat.id}
                      renamingId={renamingCatId}
                      onEditItem={setEditingItem}
                      onDuplicateItem={id => void handleDuplicateItem(id)}
                      onDeleteItem={id => void handleDeleteItem(id)}
                      onOpenItem={setDetailItem}
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
            canReorder={canReorder}
            usage={usage}
            addingHere={addingInCat === null}
            showHeader={hasCategories}
            onEditItem={setEditingItem}
            onDuplicateItem={id => void handleDuplicateItem(id)}
            onDeleteItem={id => void handleDeleteItem(id)}
            onOpenItem={setDetailItem}
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
                {t("createCategory")}
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

      {/* Modification : tout ce qui ne tient pas sur une ligne. */}
      {editingItem && (
        <CatalogItemDialog
          item={editingItem}
          type={type}
          worldId={worldId}
          open
          onOpenChange={open => { if (!open) setEditingItem(null); }}
          onSave={handleSaveItem}
        />
      )}

      {/* Consultation : ce que porte un objet, pour qui n'édite pas. */}
      {detailItem && (
        <CatalogItemDetail
          item={detailItem}
          usageCount={usage?.[detailItem.id]}
          open
          onOpenChange={open => { if (!open) setDetailItem(null); }}
        />
      )}
    </div>
  );
}

