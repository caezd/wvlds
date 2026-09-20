"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, FolderPlus, Search, Download, Upload, X, Trash2, FolderInput, CheckSquare } from "lucide-react";
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
import { loadCollapsedCategories, saveCollapsedCategories } from "@/lib/catalogueCollapse";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorldCatalogCategory, WorldCatalogRarity } from "@/types/worlds";
import {
  addWorldCatalogItem,
  updateWorldCatalogItem,
  trashWorldCatalogItem,
  restoreWorldCatalogItem,
  purgeWorldCatalogItem,
  listTrashedWorldCatalogItems,
  duplicateWorldCatalogItem,
  addWorldCatalogCategory,
  deleteWorldCatalogCategory,
  reorderWorldCatalogCategories,
  reorderWorldCatalogItems,
  importWorldCatalogItems,
  type CatalogItemInput,
} from "@/app/actions/worldCatalog";
import {
  CATALOG_RARITIES,
  buildCatalogExport,
  catalogItemMatches,
  normalizeForSearch,
  parseCatalogImport,
} from "@/lib/worldCatalog";
import { UNCAT, COL_PREFIX, groupByColumn, type CatalogType, type CatalogItem } from "./catalogueTypes";
import type { WorldCatalogItem } from "@/types/worlds";

import { CategoryRowOverlay, ItemRowOverlay } from "./CataloguePieces";
import { CatalogItemDialog, RarityDot } from "./CatalogItemDialog";
import { indexCatalog } from "@/lib/worldCatalog";
import { CatalogItemDetail } from "./CatalogItemDetail";
import { CatalogCategoryDialog } from "./CatalogCategoryDialog";
import { CatalogueRowProvider, type CatalogueRowContextValue } from "./CatalogueRowContext";
import { CatalogTrashDialog } from "./CatalogTrashDialog";
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
  usage,
}: {
  type: CatalogType;
  worldId: string;
  canEdit: boolean;
  /** Personas portant chaque objet — chargé par le parent, `null` si inconnu. */
  usage: Record<string, number> | null;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const [categories, setCategories] = useState<WorldCatalogCategory[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashed, setTrashed] = useState<WorldCatalogItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  // Le brouillon en cours de création — un objet vide qui porte déjà son
  // identifiant et sa catégorie, pour que le dialogue puisse téléverser son
  // image dans le bon dossier avant que la ligne n'existe.
  const [draft, setDraft] = useState<CatalogItem | null>(null);
  // Le catalogue indexé : la fiche y nomme prérequis et ingrédients.
  const catalogIndex = useMemo(() => indexCatalog(items), [items]);
  // La catégorie dont on édite la présentation (nom, description, bannière).
  const [editingCategory, setEditingCategory] = useState<WorldCatalogCategory | null>(null);
  const [addingCategoryInCol, setAddingCategoryInCol] = useState<number | false>(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Les objets cochés. La sélection ne survit pas à la sortie du mode
  // édition : c'est là que ses commandes vivent.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { if (!canEdit) setSelectedIds(new Set()); }, [canEdit]);

  // Les catégories repliées — lues après le montage, `localStorage` n'existe
  // pas au rendu serveur.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setCollapsed(loadCollapsedCategories(worldId, type)); }, [worldId, type]);

  function setCollapsedAndSave(next: Set<string>) {
    setCollapsed(next);
    saveCollapsedCategories(worldId, type, next);
  }

  function toggleCollapsed(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsedAndSave(next);
  }

  function expandCategory(id: string | null) {
    if (id === null || !collapsed.has(id)) return;
    const next = new Set(collapsed);
    next.delete(id);
    setCollapsedAndSave(next);
  }

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
          .select("id, world_id, type, name, sort_index, column_index, description, banner_url")
          .eq("world_id", worldId)
          .eq("type", type)
          // La corbeille a sa propre vue : la liste ne montre que le vivant.
          .is("deleted_at", null)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
        (supabase as ReturnType<typeof createClient>)
          .from("world_catalog_items")
          .select("id, world_id, type, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, properties, sort_index, category_id")
          .eq("world_id", worldId)
          .eq("type", type)
          // La corbeille a sa propre vue : la liste ne montre que le vivant.
          .is("deleted_at", null)
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


  // ── Item CRUD ──

  function newDraft(categoryId: string | null): CatalogItem {
    return {
      id: crypto.randomUUID(),
      world_id: worldId,
      type,
      category_id: categoryId,
      name: "",
      description: null,
      icon: null,
      lucide_icon: null,
      image_url: null,
      rarity: null,
      stackable: true,
      max_quantity: null,
      properties: [],
      sort_index: items.filter(i => shownCategoryOf(i) === categoryId).length,
    };
  }

  /** Enregistre le brouillon ; rend vrai si la ligne existe désormais. */
  async function handleCreateItem(id: string, data: CatalogItemInput): Promise<boolean> {
    if (!draft || draft.id !== id) return false;
    const categoryId = draft.category_id;
    const res = await addWorldCatalogItem(worldId, type, { ...data, category_id: categoryId }, { id });
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return false; }
    setItems(prev => [...prev, { ...res.item, category_id: categoryId } as CatalogItem]);
    return true;
  }

  async function handleCreateAndClose(id: string, data: CatalogItemInput) {
    if (await handleCreateItem(id, data)) setDraft(null);
  }

  async function handleCreateAndContinue(id: string, data: CatalogItemInput) {
    if (await handleCreateItem(id, data)) setDraft(newDraft(draft?.category_id ?? null));
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
    const res = await trashWorldCatalogItem(id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => prev.has(id) ? new Set([...prev].filter(x => x !== id)) : prev);
    toast.success(t("movedToTrash"));
  }

  // ── Déplacement sans glisser, et sélection multiple ──

  /**
   * La catégorie d'un objet telle qu'elle s'affiche.
   *
   * Un objet peut porter l'identifiant d'une catégorie qui n'existe plus —
   * la ligne n'est pas encore relue après un `ON DELETE SET NULL` : il est
   * alors parmi les non classés, et c'est de là qu'on le déplace.
   */
  function shownCategoryOf(item: CatalogItem): string | null {
    return item.category_id !== null && categories.some(c => c.id === item.category_id)
      ? item.category_id
      : null;
  }

  /**
   * Range des objets au bout d'une catégorie, dans leur ordre actuel.
   *
   * Le même geste que le glisser-déposer entre catégories, sans la souris :
   * il sert au menu d'une ligne et à la sélection multiple, et reste
   * possible quand une recherche a suspendu le glisser. Chaque liste touchée
   * — la cible, chaque source — est renumérotée et enregistrée à part.
   */
  function moveItemsToCategory(ids: readonly string[], targetCategoryId: string | null) {
    const wanted = new Set(ids);
    const movingItems = items.filter(i => wanted.has(i.id) && shownCategoryOf(i) !== targetCategoryId);
    if (movingItems.length === 0) return;
    const movingIds = new Set(movingItems.map(i => i.id));
    const sourceIds = [...new Set(movingItems.map(shownCategoryOf))];
    const others = items.filter(i => !movingIds.has(i.id));

    const target = [...others.filter(i => shownCategoryOf(i) === targetCategoryId), ...movingItems]
      .map((i, idx) => ({ ...i, category_id: targetCategoryId, sort_index: idx }));
    const sources = sourceIds.map(src =>
      others.filter(i => shownCategoryOf(i) === src).map((i, idx) => ({ ...i, category_id: src, sort_index: idx })),
    );
    const untouched = others.filter(i => {
      const cat = shownCategoryOf(i);
      return cat !== targetCategoryId && !sourceIds.includes(cat);
    });

    setItems([...untouched, ...target, ...sources.flat()]);
    for (const list of [target, ...sources]) {
      if (list.length === 0) continue;
      reportSaveFailure(reorderWorldCatalogItems(
        list.map(i => ({ id: i.id, sort_index: i.sort_index, category_id: i.category_id })),
      ), tCommon("saveError"));
    }
    // L'objet arrive dans une catégorie repliée : on l'ouvre, sinon il
    // semble avoir disparu.
    expandCategory(targetCategoryId);
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleTrashSelected() {
    const ids = [...selectedIds];
    const results = await Promise.all(ids.map(id => trashWorldCatalogItem(id).then(r => ({ id, ...r }))));
    const done = new Set(results.filter(r => r.ok).map(r => r.id));
    if (done.size > 0) setItems(prev => prev.filter(i => !done.has(i.id)));
    setSelectedIds(new Set(ids.filter(id => !done.has(id))));
    const failed = results.find(r => !r.ok);
    if (failed) toast.error(messageErreurAction(failed.error, tCommon));
    else toast.success(t("movedToTrashCount", { count: done.size }));
  }

  async function handleRaritySelected(rarity: WorldCatalogRarity | null) {
    const ids = [...selectedIds];
    const results = await Promise.all(ids.map(id => updateWorldCatalogItem(id, { rarity }).then(r => ({ id, ...r }))));
    const done = new Set(results.filter(r => r.ok).map(r => r.id));
    if (done.size > 0) setItems(prev => prev.map(i => (done.has(i.id) ? { ...i, rarity } : i)));
    const failed = results.find(r => !r.ok);
    if (failed) toast.error(messageErreurAction(failed.error, tCommon));
  }

  // ── Corbeille ──
  // Les objets supprimés ne sont chargés qu'à l'ouverture : on n'en a besoin
  // que là, et la liste vivante n'a pas à attendre après eux.

  async function openTrash() {
    setTrashOpen(true);
    setTrashLoading(true);
    const res = await listTrashedWorldCatalogItems(worldId, type);
    if (!res.ok) toast.error(messageErreurAction(res.error, tCommon));
    else setTrashed(res.items);
    setTrashLoading(false);
  }

  async function handleRestore(item: WorldCatalogItem) {
    const res = await restoreWorldCatalogItem(item.id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setTrashed(prev => prev.filter(i => i.id !== item.id));
    // La catégorie de l'objet a pu être supprimée entre-temps : `ON DELETE SET
    // NULL` l'a alors mis à `null`, et il revient parmi les non classés.
    setItems(prev => [...prev, { ...res.item, category_id: res.item.category_id ?? null } as CatalogItem]);
  }

  async function handleDeleteForever(item: WorldCatalogItem) {
    const res = await purgeWorldCatalogItem(item.id);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    setTrashed(prev => prev.filter(i => i.id !== item.id));
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
        .select("id, world_id, type, name, sort_index, column_index, description, banner_url")
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
  const uncatItems = visibleItems.filter(i => shownCategoryOf(i) === null);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id));

  // Pas de `useMemo` : les rappels lisent `items` et `collapsed` du rendu en
  // cours, et la liste se rend de toute façon en entier à chaque changement.
  const rowContext: CatalogueRowContextValue = {
    categories,
    selectedIds,
    onMoveItem: (id, categoryId) => moveItemsToCategory([id], categoryId),
    onToggleSelected: toggleSelected,
  };
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

        {/* Export et import ne s'offrent qu'en mode édition : ce sont deux
            gestes d'auteur, et la recherche est la seule chose qu'un membre
            vient faire ici. */}
        {canEdit && (
          <>
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
              onClick={() => void openTrash()}
              title={t("trash")}
              aria-label={t("trash")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-soft text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

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

      {/* Barre de sélection : ce qu'on fait de plusieurs objets à la fois. */}
      {canEdit && selectedCount > 0 && (
        <div
          role="toolbar"
          aria-label={t("selectionToolbar")}
          className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs"
        >
          <span className="px-1 font-medium tabular-nums">{t("selectedCount", { count: selectedCount })}</span>
          {!allVisibleSelected && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(visibleItems.map(i => i.id)))}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {t("selectAllVisible")}
            </button>
          )}
          <span className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <FolderInput className="h-3.5 w-3.5" />
                {t("moveTo")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {categories.map(cat => (
                <DropdownMenuItem key={cat.id} onSelect={() => moveItemsToCategory([...selectedIds], cat.id)}>
                  {cat.name}
                </DropdownMenuItem>
              ))}
              {categories.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => moveItemsToCategory([...selectedIds], null)}>
                {t("uncategorized")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {t("rarity")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {CATALOG_RARITIES.map(r => (
                <DropdownMenuItem key={r} onSelect={() => void handleRaritySelected(r)}>
                  <RarityDot rarity={r} className="mr-2" />
                  {t(`rarity${r.charAt(0).toUpperCase()}${r.slice(1)}`)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleRaritySelected(null)}>{t("rarityNone")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => void handleTrashSelected()}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {tCommon("delete")}
          </button>
          <button
            type="button"
            aria-label={t("clearSelection")}
            title={t("clearSelection")}
            onClick={() => setSelectedIds(new Set())}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {searching && visibleItems.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
      )}

      <CatalogueRowProvider value={rowContext}>
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
                      // Une recherche déplie tout : ses résultats doivent se voir.
                      collapsed={collapsed.has(cat.id) && !searching}
                      onToggleCollapsed={toggleCollapsed}
                      onEditItem={setEditingItem}
                      onDuplicateItem={id => void handleDuplicateItem(id)}
                      onDeleteItem={id => void handleDeleteItem(id)}
                      onOpenItem={setDetailItem}
                      onAddIn={categoryId => setDraft(newDraft(categoryId))}
                      onEditCategory={setEditingCategory}
                      onDeleteCategory={id => void handleDeleteCategory(id)}
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
        {(!hasCategories || uncatItems.length > 0 || canEdit) && (
          <UncategorizedSection
            items={uncatItems}
            type={type}
            canEdit={canEdit}
            canReorder={canReorder}
            usage={usage}
            showHeader={hasCategories}
            onEditItem={setEditingItem}
            onDuplicateItem={id => void handleDuplicateItem(id)}
            onDeleteItem={id => void handleDeleteItem(id)}
            onOpenItem={setDetailItem}
            onAddIn={categoryId => setDraft(newDraft(categoryId))}
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
      </CatalogueRowProvider>

      {/* Création : le même dialogue que la modification, sur un brouillon. */}
      {draft && (
        <CatalogItemDialog
          item={draft}
          type={type}
          worldId={worldId}
          open
          creating
          onOpenChange={open => { if (!open) setDraft(null); }}
          onSave={handleCreateAndClose}
          onSaveAndContinue={handleCreateAndContinue}
          siblings={items}
        />
      )}

      {/* Modification : tout ce qui ne tient pas sur une ligne. */}
      {editingItem && (
        <CatalogItemDialog
          item={editingItem}
          type={type}
          worldId={worldId}
          open
          onOpenChange={open => { if (!open) setEditingItem(null); }}
          onSave={handleSaveItem}
          siblings={items}
        />
      )}

      <CatalogTrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        items={trashed}
        loading={trashLoading}
        usage={usage}
        onRestore={item => void handleRestore(item)}
        onDeleteForever={item => void handleDeleteForever(item)}
      />

      {/* Consultation : ce que porte un objet, pour qui n'édite pas. */}
      {editingCategory && (
        <CatalogCategoryDialog
          key={editingCategory.id}
          category={editingCategory}
          open
          onOpenChange={(open) => { if (!open) setEditingCategory(null); }}
          onSaved={(next) => setCategories(prev => prev.map(c => (c.id === next.id ? next : c)))}
        />
      )}

      {detailItem && (
        <CatalogItemDetail
          item={detailItem}
          usageCount={usage?.[detailItem.id]}
          open
          onOpenChange={open => { if (!open) setDetailItem(null); }}
                  catalog={catalogIndex}
          onNavigate={(next) => setDetailItem({ ...next, category_id: next.category_id ?? null })}
        />
      )}
    </div>
  );
}

