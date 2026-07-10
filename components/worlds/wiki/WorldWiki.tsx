"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { saveWorldPrefs } from "@/app/(protected)/w/actions";
import {
  BookOpenText,
  Check,
  Eye,
  FileText,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { LucideIconPicker, VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const WIKI_NAV_MIN = 120;
const WIKI_NAV_MAX = 360;
const WIKI_NAV_DEFAULT = 208;

type WikiPage = {
  id: string;
  world_id: string;
  parent_id: string | null;
  title: string;
  slug: string;
  content: string | null;
  is_folder: boolean;
  sort_index: number;
  icon: string | null;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "page"
  );
}

// ── Nœud sortable ─────────────────────────────────────────────────────────────

type SortableTreeNodeProps = {
  page: WikiPage;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameIcon: string;
  editMode: boolean;
  subtree: React.ReactNode;
  createInput: React.ReactNode;
  onSelect: () => void;
  onToggleFolder: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameIconChange: (v: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onCreateInFolder: () => void;
};

function SortableTreeNode({
  page, depth, isSelected, isExpanded, isRenaming, renameValue, renameIcon,
  editMode, subtree, createInput, onSelect, onToggleFolder, onStartRename,
  onRenameChange, onRenameIconChange, onConfirmRename, onCancelRename,
  onDelete, onCreateInFolder,
}: SortableTreeNodeProps) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: page.id, disabled: !editMode });

  // isOver natif de useSortable — vrai quand un élément est glissé sur ce nœud
  const isDropTarget = isOver && page.is_folder;

  // Dossier cible : on neutralise le transform (pas de déplacement de tri)
  const style: React.CSSProperties = {
    transform: isDropTarget ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group flex cursor-pointer select-none items-center gap-1.5 rounded-md py-1 text-sm",
          "hover:bg-secondary/60",
          isSelected && !page.is_folder && "bg-secondary font-medium text-foreground",
          isDropTarget && "ring-1 ring-inset ring-primary/50 bg-primary/5 text-foreground",
        )}
        style={{ paddingLeft: `${0.5 + depth}rem`, paddingRight: "0.25rem" }}
        onClick={() => { if (page.is_folder) onToggleFolder(); else onSelect(); }}
      >
        {editMode && (
          <span
            {...attributes}
            {...listeners}
            className="flex shrink-0 cursor-grab items-center text-muted-foreground/30 transition-colors hover:text-muted-foreground/60 active:cursor-grabbing"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        {isRenaming ? (
          // Mode renommage : icône cliquable pour la changer
          <LucideIconPicker
            value={renameIcon}
            onChange={onRenameIconChange}
            trigger={
              <button
                type="button"
                onClick={e => e.stopPropagation()}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                title={t("changeIcon")}
              >
                {renameIcon && VALID_LUCIDE_ICONS.has(renameIcon) ? (
                  <DynamicIcon name={renameIcon as IconName} className="h-3.5 w-3.5" />
                ) : page.is_folder ? (
                  <Folder className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
              </button>
            }
          />
        ) : page.icon && VALID_LUCIDE_ICONS.has(page.icon) ? (
          <DynamicIcon name={page.icon as IconName} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : page.is_folder ? (
          isExpanded
            ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {isRenaming ? (
          <>
            <input
              value={renameValue}
              onChange={e => onRenameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); onConfirmRename(); }
                if (e.key === "Escape") onCancelRename();
              }}
              autoFocus
              className="min-w-0 flex-1 border-b border-border bg-transparent py-0 text-sm outline-none"
              onClick={e => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onConfirmRename(); }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={tCommon("confirm")}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <span className={cn("flex-1 truncate", page.is_folder && "font-medium text-foreground/80")}>
            {page.title}
          </span>
        )}

        {editMode && !isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={e => e.stopPropagation()}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground"
                aria-label={t("options")}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {page.is_folder && (
                <>
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); onCreateInFolder(); }}>
                    <FilePlus className="mr-2 h-4 w-4" /> {t("addPage")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onStartRename(); }}>
                <Pencil className="mr-2 h-4 w-4" /> {t("rename")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {page.is_folder && isExpanded && (
        <div>
          {subtree}
          {createInput}
        </div>
      )}
    </div>
  );
}

// ── WorldWiki ─────────────────────────────────────────────────────────────────

export function WorldWiki({
  worldId,
  canEdit,
  initialSidebarWidth,
  onClose,
}: {
  worldId: string;
  canEdit: boolean;
  initialSidebarWidth?: number;
  onClose: () => void;
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const [pages, setPages] = React.useState<WikiPage[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [editMode, setEditMode] = React.useState(false);

  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<WikiPage | null>(null);

  const [creating, setCreating] = React.useState<{ parentId: string | null; isFolder: boolean } | null>(null);
  const [createTitle, setCreateTitle] = React.useState("");
  const createInputRef = React.useRef<HTMLInputElement>(null);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [createIcon, setCreateIcon] = React.useState("");
  const [renameIcon, setRenameIcon] = React.useState("");

  // ── Resize de la sidebar nav ──────────────────────────────
  const [navWidth, setNavWidth] = React.useState(
    initialSidebarWidth ?? WIKI_NAV_DEFAULT,
  );
  const isDraggingNav = React.useRef(false);
  const navDragStartX = React.useRef(0);
  const navDragStartWidth = React.useRef(0);
  const navWidthRef = React.useRef(navWidth);
  navWidthRef.current = navWidth;
  const navSaveTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function onNavResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingNav.current = true;
    navDragStartX.current = e.clientX;
    navDragStartWidth.current = navWidthRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onNavResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingNav.current) return;
    const w = Math.min(WIKI_NAV_MAX, Math.max(WIKI_NAV_MIN,
      navDragStartWidth.current + (e.clientX - navDragStartX.current),
    ));
    setNavWidth(w);
  }

  function onNavResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingNav.current) return;
    isDraggingNav.current = false;
    const w = Math.min(WIKI_NAV_MAX, Math.max(WIKI_NAV_MIN,
      navDragStartWidth.current + (e.clientX - navDragStartX.current),
    ));
    setNavWidth(w);
    if (navSaveTimeout.current) clearTimeout(navSaveTimeout.current);
    navSaveTimeout.current = setTimeout(
      () => void saveWorldPrefs(worldId, { wiki_sidebar_width: w }),
      600,
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    const { data, error } = await supabase
      .from("world_wiki_pages")
      .select("*")
      .eq("world_id", worldId)
      .order("sort_index", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setPages(data as WikiPage[]);
  }

  React.useEffect(() => { void load(); }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (creating) {
      setCreateTitle("");
      setCreateIcon("");
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [creating]);

  // Reset content editor on page change
  React.useEffect(() => {
    setEditing(false);
    setShowPreview(false);
    const page = pages?.find(p => p.id === selectedId);
    setDraft(page?.content ?? "");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving edit mode clears transient editing state
  React.useEffect(() => {
    if (!editMode) {
      setEditing(false);
      setShowPreview(false);
      setCreating(null);
      setRenamingId(null);
    }
  }, [editMode]);

  // ── Helpers ──────────────────────────────────────────────────
  function childrenOf(parentId: string | null): WikiPage[] {
    return (pages ?? [])
      .filter(p => p.parent_id === parentId)
      .sort((a, b) => a.sort_index - b.sort_index);
  }

  function toggleFolder(id: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────
  async function createPage(parentId: string | null, title: string, isFolder: boolean, icon: string) {
    const siblings = childrenOf(parentId);
    const sort_index = siblings.length;

    let slug = slugify(title);
    const existingSlugs = new Set((pages ?? []).map(p => p.slug));
    if (existingSlugs.has(slug)) {
      let n = 2;
      while (existingSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }

    const { data, error } = await supabase
      .from("world_wiki_pages")
      .insert({ world_id: worldId, parent_id: parentId, title, slug, is_folder: isFolder, sort_index, icon: icon || null })
      .select("*")
      .single();
    if (error) { toast.error(error.message); return; }

    setPages(prev => [...(prev ?? []), data as WikiPage]);
    if (isFolder) {
      setExpandedFolders(prev => new Set([...prev, data.id]));
    } else {
      setSelectedId(data.id);
    }
    setCreating(null);
  }

  async function renamePage(page: WikiPage, newTitle: string, newIcon: string) {
    const title = newTitle.trim();
    if (!title) { setRenamingId(null); return; }
    const icon = newIcon || null;
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({ title, icon })
      .eq("id", page.id);
    if (error) { toast.error(error.message); return; }
    setPages(prev => prev?.map(p => p.id === page.id ? { ...p, title, icon } : p) ?? null);
    setRenamingId(null);
  }

  async function deletePage(page: WikiPage) {
    const { error } = await supabase
      .from("world_wiki_pages")
      .delete()
      .eq("id", page.id);
    if (error) { toast.error(error.message); return; }

    const toDelete = new Set<string>();
    function collect(id: string) {
      toDelete.add(id);
      (pages ?? []).filter(p => p.parent_id === id).forEach(p => collect(p.id));
    }
    collect(page.id);

    setPages(prev => prev?.filter(p => !toDelete.has(p.id)) ?? null);
    if (selectedId && toDelete.has(selectedId)) setSelectedId(null);
    toast.success(t("deleted"));
  }

  async function saveContent() {
    if (!selectedPage) return;
    setSaving(true);
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({ content: draft, updated_at: new Date().toISOString() })
      .eq("id", selectedPage.id);
    setSaving(false);
    if (error) { toast.error(t("saveError"), { description: error.message }); return; }
    setPages(prev =>
      prev?.map(p => p.id === selectedPage.id ? { ...p, content: draft } : p) ?? null
    );
    setEditing(false);
  }

  // ── DnD ──────────────────────────────────────────────────────
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !pages) return;

    const activePage = pages.find(p => p.id === active.id);
    const overPage = pages.find(p => p.id === over.id);
    if (!activePage || !overPage) return;

    // ── Dépôt dans un dossier (devient enfant) ────────────────
    if (overPage.is_folder && overPage.id !== activePage.parent_id) {
      const sort_index = childrenOf(overPage.id).length;
      setPages(prev =>
        prev?.map(p => p.id === activePage.id
          ? { ...p, parent_id: overPage.id, sort_index }
          : p
        ) ?? null
      );
      setExpandedFolders(prev => new Set([...prev, overPage.id]));
      void supabase
        .from("world_wiki_pages")
        .update({ parent_id: overPage.id, sort_index })
        .eq("id", activePage.id);
      return;
    }

    // ── Réordonnancement entre pairs (même parent) ────────────
    if (activePage.parent_id !== overPage.parent_id) return;

    const siblings = childrenOf(activePage.parent_id);
    const oldIdx = siblings.findIndex(p => p.id === activePage.id);
    const newIdx = siblings.findIndex(p => p.id === overPage.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(siblings, oldIdx, newIdx);
    const updates = reordered.map((p, i) => ({ id: p.id, sort_index: i }));

    setPages(prev =>
      prev?.map(p => {
        const u = updates.find(u => u.id === p.id);
        return u ? { ...p, sort_index: u.sort_index } : p;
      }) ?? null
    );

    void supabase.from("world_wiki_pages").upsert(updates);
  }

  const selectedPage = pages?.find(p => p.id === selectedId) ?? null;
  const isEditMode = editMode && canEdit;

  // ── Tree ─────────────────────────────────────────────────────
  function renderCreateInput(parentId: string | null, depth: number) {
    const isFolder = creating?.isFolder ?? false;
    return (
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1"
        style={{ paddingLeft: `${0.5 + depth}rem` }}
      >
        <LucideIconPicker
          value={createIcon}
          onChange={setCreateIcon}
          trigger={
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              title={t("chooseIcon")}
            >
              {createIcon && VALID_LUCIDE_ICONS.has(createIcon) ? (
                <DynamicIcon name={createIcon as IconName} className="h-3.5 w-3.5" />
              ) : isFolder ? (
                <Folder className="h-3.5 w-3.5" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
            </button>
          }
        />
        <input
          ref={createInputRef}
          value={createTitle}
          onChange={e => setCreateTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && createTitle.trim()) {
              e.preventDefault();
              void createPage(parentId, createTitle.trim(), isFolder, createIcon);
            }
            if (e.key === "Escape") setCreating(null);
          }}
          placeholder={isFolder ? t("folderNamePlaceholder") : t("pageTitlePlaceholder")}
          className="flex-1 border-b border-border bg-transparent py-0 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={() => setCreating(null)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={tCommon("cancel")}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  function renderTree(parentId: string | null, depth: number = 0): React.ReactNode {
    const children = childrenOf(parentId);

    return (
      <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
        {children.map(page => {
          const isExpanded = expandedFolders.has(page.id);
          return (
            <SortableTreeNode
              key={page.id}
              page={page}
              depth={depth}
              isSelected={selectedId === page.id}
              isExpanded={isExpanded}
              isRenaming={renamingId === page.id}
              renameValue={renameValue}
              renameIcon={renameIcon}
              editMode={isEditMode}
              subtree={page.is_folder && isExpanded ? renderTree(page.id, depth + 1) : null}
              createInput={creating?.parentId === page.id ? renderCreateInput(page.id, depth + 1) : null}
              onSelect={() => setSelectedId(page.id)}
              onToggleFolder={() => toggleFolder(page.id)}
              onStartRename={() => { setRenamingId(page.id); setRenameValue(page.title); setRenameIcon(page.icon ?? ""); }}
              onRenameChange={setRenameValue}
              onRenameIconChange={setRenameIcon}
              onConfirmRename={() => void renamePage(page, renameValue, renameIcon)}
              onCancelRename={() => setRenamingId(null)}
              onDelete={() => setConfirmDelete(page)}
              onCreateInFolder={() => {
                if (!expandedFolders.has(page.id)) toggleFolder(page.id);
                setCreating({ parentId: page.id, isFolder: false });
              }}
            />
          );
        })}
        {creating?.parentId === parentId && parentId === null && renderCreateInput(null, depth)}
      </SortableContext>
    );
  }

  // ── Content ──────────────────────────────────────────────────
  function renderContent() {
    if (!selectedPage || selectedPage.is_folder) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {!pages?.length
              ? isEditMode
                ? t("emptyEdit")
                : t("emptyRead")
              : t("selectPage")}
          </p>
        </div>
      );
    }

    if (editing) {
      return (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden p-6">
          <div className="flex items-center gap-3">
            <h1 className="flex flex-1 items-center gap-2 truncate text-xl font-semibold">
              {selectedPage.icon && VALID_LUCIDE_ICONS.has(selectedPage.icon) && (
                <DynamicIcon name={selectedPage.icon as IconName} className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              {selectedPage.title}
            </h1>
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                showPreview
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Eye className="h-3 w-3" /> {t("preview")}
            </button>
          </div>

          <div className={cn("min-h-0 flex-1", showPreview ? "flex gap-4" : "flex flex-col")}>
            <div className={cn(
              "rounded-2xl border border-border-soft p-4",
              showPreview ? "flex flex-1 flex-col overflow-hidden" : "flex flex-1 flex-col overflow-hidden",
            )}>
              <ParagraphBlockEditor
                value={draft}
                onChange={setDraft}
                placeholder={t("contentPlaceholder")}
                submitOnEnter={false}
                wrapperClassName="max-h-none flex-1 overflow-y-auto"
                className="text-sm"
              />
            </div>
            {showPreview && (
              <div className="flex-1 overflow-y-auto rounded-2xl border border-border-soft p-4">
                {draft.trim()
                  ? <MarkdownRenderer content={draft} />
                  : <p className="text-sm italic text-muted-foreground">{t("nothingToPreview")}</p>
                }
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDraft(selectedPage.content ?? ""); setEditing(false); setShowPreview(false); }}
              disabled={saving}
            >
              {tCommon("cancel")}
            </Button>
            <Button size="sm" onClick={() => void saveContent()} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              {selectedPage.icon && VALID_LUCIDE_ICONS.has(selectedPage.icon) && (
                <DynamicIcon name={selectedPage.icon as IconName} className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              {selectedPage.title}
            </h1>
            {isEditMode && (
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => { setDraft(selectedPage.content ?? ""); setEditing(true); }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> {tCommon("edit")}
              </Button>
            )}
          </div>
          {selectedPage.content?.trim() ? (
            <MarkdownRenderer content={selectedPage.content} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {isEditMode ? t("pageEmptyEdit") : t("pageEmpty")}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={open => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { title: confirmDelete?.title ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.is_folder
                ? t("deleteFolderDesc")
                : t("deletePageDesc")}{" "}
              {t("deleteIrreversible")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) void deletePage(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex h-full min-h-0 flex-1 flex-col">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3">
          <BookOpenText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold">Wiki</span>

          {canEdit && (
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
          )}

          {isEditMode && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setCreating({ parentId: null, isFolder: false })}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <FilePlus className="h-3.5 w-3.5" /> {t("newPage")}
              </button>
              <button
                type="button"
                onClick={() => setCreating({ parentId: null, isFolder: true })}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <FolderPlus className="h-3.5 w-3.5" /> {t("newFolder")}
              </button>
            </div>
          )}

          <div className="ml-auto">
            <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("closeWiki")}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar nav */}
          <div
            className="shrink-0 overflow-y-auto border-r border-border-soft py-1.5"
            style={{ width: navWidth }}
          >
            {pages === null ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <nav className="px-1">
                <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                  {renderTree(null)}
                </DndContext>
                {pages.length === 0 && !creating && (
                  <p className="px-2 py-1 text-xs italic text-muted-foreground">{t("noPages")}</p>
                )}
              </nav>
            )}
          </div>

          {/* Handle de redimensionnement — visible uniquement en mode modification */}
          {isEditMode && (
            <div
              className="group relative w-2 shrink-0 cursor-col-resize select-none"
              onPointerDown={onNavResizeDown}
              onPointerMove={onNavResizeMove}
              onPointerUp={onNavResizeUp}
              onPointerCancel={onNavResizeUp}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-soft transition-colors group-hover:bg-border" />
            </div>
          )}

          {/* Content area */}
          <div className="flex min-h-0 flex-1">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}
