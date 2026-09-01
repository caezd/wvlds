"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  FilePlus,
  FolderPlus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { SANS_BALAYAGE } from "@/components/ui/drawer";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { cn } from "@/lib/utils";
import { useWikiPageNotes, type WikiNoteGroup } from "@/hooks/useWikiPageNotes";
import type { WikiNoteCategory, WikiPageNote } from "@/types/worlds";
import { WikiNoteCard, noteDragId } from "./WikiNoteCard";
import { WIKI_FOOTER, WIKI_FOOTER_BUTTON } from "./wikiSubHeader";

/**
 * Les catégories et les fiches vivent dans le même `DndContext` — on doit
 * pouvoir lâcher une fiche sur une catégorie repliée. Leurs identifiants sont
 * donc préfixés pour que `onDragEnd` sache ce qu'il déplace.
 */
const CATEGORY_PREFIX = "cat:";
const categoryDragId = (id: string) => `${CATEGORY_PREFIX}${id}`;
const categoryIdOf = (dragId: string) =>
  dragId.startsWith(CATEGORY_PREFIX) ? dragId.slice(CATEGORY_PREFIX.length) : null;
const noteIdOf = (dragId: string) =>
  dragId.startsWith("note:") ? dragId.slice("note:".length) : null;

/** Catégories repliées, par page — un confort de lecture, propre à chaque personne. */
function collapsedKey(pageId: string) {
  return `wiki-notes-collapsed:${pageId}`;
}

function loadCollapsed(pageId: string): Set<string> {
  try {
    const raw = localStorage.getItem(collapsedKey(pageId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(pageId: string, ids: Set<string>) {
  try {
    localStorage.setItem(collapsedKey(pageId), JSON.stringify([...ids]));
  } catch {
    // mode privé, quota — le pli reprend simplement sa valeur par défaut
  }
}

/** Ossature proposée quand la page n'a encore aucune catégorie. */
const SUGGESTIONS = ["overview", "entities", "relationships", "places", "moments"] as const;

// ──────────────────────────────────────────────────────────────
// Une catégorie et ses fiches
// ──────────────────────────────────────────────────────────────
function CategorySection({
  group,
  canEdit,
  collapsed,
  expandedNotes,
  pending,
  onToggleCollapsed,
  onExpand,
  adding,
  onAddingChange,
  onToggleNote,
  onRename,
  onDelete,
  onCreateNote,
  ficheEnGlisse,
  onSaveNote,
  onDeleteNote,
}: {
  group: WikiNoteGroup;
  canEdit: boolean;
  collapsed: boolean;
  expandedNotes: Set<string>;
  pending: boolean;
  onToggleCollapsed: () => void;
  /** Déplie sans replier — le « + » doit montrer la fiche qu'il crée. */
  onExpand: () => void;
  /**
   * Saisie d'une nouvelle fiche ouverte ici.
   *
   * Piloté par le panneau, et non gardé en local : le bouton du pied de
   * colonne doit pouvoir l'ouvrir sur une catégorie qu'il ne contient pas.
   */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  onToggleNote: (id: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onCreateNote: (title: string) => void;
  /** Une fiche est tenue par le curseur — une catégorie peut l'accueillir. */
  ficheEnGlisse: boolean;
  onSaveNote: (note: WikiPageNote, patch: { title: string; body: string }) => void;
  onDeleteNote: (note: WikiPageNote) => void;
}) {
  const t = useTranslations("wiki.notes");
  const tCommon = useTranslations("common");

  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(group.category.name);
  const [newTitle, setNewTitle] = React.useState("");
  const setAdding = onAddingChange;

  const { attributes, listeners, setNodeRef, transform, transition, isOver, isDragging } =
    useSortable({ id: categoryDragId(group.category.id), disabled: !canEdit || renaming });

  function commitRename() {
    setRenaming(false);
    if (name.trim() && name.trim() !== group.category.name) onRename(name.trim());
    else setName(group.category.name);
  }

  function commitNewNote() {
    if (!newTitle.trim()) { setAdding(false); return; }
    onCreateNote(newTitle.trim());
    setNewTitle("");
    setAdding(false);
  }

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg",
        isDragging && "opacity-50",
        // Une fiche survole la catégorie : on montre qu'elle l'accueillera,
        // y compris quand elle est repliée et n'a donc rien à survoler. Le
        // cadre ne vaut que pour une fiche : une catégorie glissée sur une
        // autre se range à côté d'elle, jamais dedans.
        isOver && ficheEnGlisse && "ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            {...SANS_BALAYAGE}
            aria-label={t("reorderCategory")}
            className="shrink-0 cursor-grab text-muted-foreground/50 hover:text-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {renaming ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { e.preventDefault(); setName(group.category.name); setRenaming(false); }
            }}
            maxLength={DB_TEXT_LIMITS["world_wiki_page_note_categories.name"]}
            className="flex-1 border-b border-border bg-transparent text-xs font-semibold uppercase tracking-wide outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                !collapsed && "rotate-90",
              )}
            />
            <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.category.name}
            </span>
            {group.notes.length > 0 && (
              <span className="shrink-0 rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
                {group.notes.length}
              </span>
            )}
          </button>
        )}

        {canEdit && !renaming && (
          <>
            <button
              type="button"
              onClick={() => { onExpand(); setAdding(true); }}
              aria-label={t("addNote")}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("categoryActions")}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> {t("renameCategory")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={afterMenuClose(onDelete)} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="pl-2">
          <SortableContext
            items={group.notes.map(n => noteDragId(n.id))}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {group.notes.map(note => (
                <WikiNoteCard
                  key={note.id}
                  note={note}
                  canEdit={canEdit}
                  expanded={expandedNotes.has(note.id)}
                  onToggleExpanded={() => onToggleNote(note.id)}
                  onSave={patch => onSaveNote(note, patch)}
                  onDelete={() => onDeleteNote(note)}
                />
              ))}
            </ul>
          </SortableContext>

          {group.notes.length === 0 && !adding && (
            <p className="px-2 py-1 text-xs italic text-muted-foreground">{t("emptyCategory")}</p>
          )}

          {canEdit && (adding ? (
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onBlur={commitNewNote}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitNewNote(); }
                if (e.key === "Escape") { e.preventDefault(); setNewTitle(""); setAdding(false); }
              }}
              maxLength={DB_TEXT_LIMITS["world_wiki_page_notes.title"]}
              placeholder={t("titlePlaceholder")}
              className="mt-1 w-full rounded-md border border-border-soft bg-transparent px-2 py-1 text-sm outline-none focus:border-primary/50"
              autoFocus
              disabled={pending}
            />
          ) : null)}
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// Le panneau
// ──────────────────────────────────────────────────────────────
/**
 * Complément d'un article : des fiches — vue d'ensemble, entités, relations,
 * lieux, moments — rangées en catégories repliables, réordonnables au
 * glisser-déposer.
 *
 * Rien ici n'est attaché à un passage du texte : c'est ce qui distingue ces
 * notes des commentaires ancrés (`WikiAnnotationsPanel`), qui, eux, visent une
 * phrase précise.
 */
export function WikiNotesPanel({
  pageId,
  isEditMode,
  notes,
}: {
  pageId: string;
  /**
   * Bascule « Modifier » du wiki, permission comprise — elle ne fait
   * qu'afficher les commandes, comme partout ailleurs dans le panneau. Le
   * droit d'écrire, lui, est tenu par la RLS (migration 139 : éditeurs seuls).
   */
  isEditMode: boolean;
  /**
   * État des notes, tenu par la page.
   *
   * Le chargement vit chez elle et non ici : le sous-en-tête annonce le nombre
   * de fiches quand ce panneau est fermé, donc démonté. Cela garantit aussi
   * une seule souscription temps réel, là où colonne et tiroir pouvaient en
   * ouvrir deux.
   */
  notes: ReturnType<typeof useWikiPageNotes>;
}) {
  const t = useTranslations("wiki.notes");
  const tCommon = useTranslations("common");

  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [expandedNotes, setExpandedNotes] = React.useState<Set<string>>(() => new Set());
  const [creatingCategory, setCreatingCategory] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState("");
  const [confirmCategory, setConfirmCategory] = React.useState<WikiNoteCategory | null>(null);
  const [confirmNote, setConfirmNote] = React.useState<WikiPageNote | null>(null);
  /** Catégorie dont la saisie d'une nouvelle fiche est ouverte, s'il y en a une. */
  const [categorieEnAjout, setCategorieEnAjout] = React.useState<string | null>(null);

  // Le pli est local à la personne : il ne passe pas par la base, et se relit
  // au changement de page.
  React.useEffect(() => {
    setCollapsed(loadCollapsed(pageId));
    setExpandedNotes(new Set());
  }, [pageId]);

  function toggleCollapsed(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(pageId, next);
      return next;
    });
  }

  function expandCategory(id: string) {
    setCollapsed(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      saveCollapsed(pageId, next);
      return next;
    });
  }

  function toggleNote(id: string) {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  /** Fiche ou catégorie tenue par le curseur — c'est elle que l'aperçu montre. */
  const [idGlisse, setIdGlisse] = React.useState<string | null>(null);

  const categorieGlissee = idGlisse
    ? notes.groups.find(g => g.category.id === categoryIdOf(idGlisse))?.category ?? null
    : null;
  const ficheGlissee = idGlisse
    ? (notes.notes ?? []).find(n => n.id === noteIdOf(idGlisse)) ?? null
    : null;

  function onDragStart({ active }: DragStartEvent) {
    setIdGlisse(String(active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setIdGlisse(null);
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // ── Réordonnancement des catégories ─────────────────────
    const categorieDeplacee = categoryIdOf(activeId);
    if (categorieDeplacee) {
      const cible = categoryIdOf(overId);
      if (!cible) return; // une catégorie ne se range pas dans une fiche
      const liste = notes.groups.map(g => g.category);
      const de = liste.findIndex(c => c.id === categorieDeplacee);
      const vers = liste.findIndex(c => c.id === cible);
      if (de === -1 || vers === -1) return;
      void notes.reorderCategories(arrayMove(liste, de, vers));
      return;
    }

    // ── Déplacement d'une fiche ─────────────────────────────
    const ficheDeplacee = noteIdOf(activeId);
    if (!ficheDeplacee) return;

    // Lâchée sur une catégorie (repliée, ou vide) : elle en prend la fin.
    const categorieCible = categoryIdOf(overId);
    if (categorieCible) {
      const groupe = notes.groups.find(g => g.category.id === categorieCible);
      void notes.moveNote(ficheDeplacee, categorieCible, groupe?.notes.length ?? 0);
      return;
    }

    // Lâchée sur une autre fiche : elle prend sa place. L'index est celui de
    // la cible dans la liste affichée — la sémantique d'`arrayMove`, que
    // `planNoteMove` reproduit.
    const ficheCible = noteIdOf(overId);
    const cible = (notes.notes ?? []).find(n => n.id === ficheCible);
    if (!cible) return;
    const liste = notes.groups.find(g => g.category.id === cible.category_id)?.notes ?? [];
    void notes.moveNote(ficheDeplacee, cible.category_id, liste.findIndex(n => n.id === cible.id));
  }

  function commitCategory() {
    if (!categoryName.trim()) { setCreatingCategory(false); return; }
    void notes.createCategory(categoryName.trim());
    setCategoryName("");
    setCreatingCategory(false);
  }

  const vide = !notes.loading && notes.groups.length === 0;

  return (
    <>
      <DeleteConfirmDialog
        open={!!confirmCategory}
        onOpenChange={open => { if (!open) setConfirmCategory(null); }}
        title={t("deleteCategoryTitle", { name: confirmCategory?.name ?? "" })}
        description={t("deleteCategoryDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => {
          if (confirmCategory) void notes.deleteCategory(confirmCategory);
          setConfirmCategory(null);
        }}
      />
      <DeleteConfirmDialog
        open={!!confirmNote}
        onOpenChange={open => { if (!open) setConfirmNote(null); }}
        title={t("deleteNoteTitle", { title: confirmNote?.title ?? "" })}
        description={t("deleteNoteDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => {
          if (confirmNote) void notes.deleteNote(confirmNote);
          setConfirmNote(null);
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {notes.loading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setIdGlisse(null)}
            >
              <SortableContext
                items={notes.groups.map(g => categoryDragId(g.category.id))}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {notes.groups.map(group => (
                    <CategorySection
                      key={group.category.id}
                      group={group}
                      canEdit={isEditMode}
                      collapsed={collapsed.has(group.category.id)}
                      expandedNotes={expandedNotes}
                      pending={notes.pending}
                      onToggleCollapsed={() => toggleCollapsed(group.category.id)}
                      onExpand={() => expandCategory(group.category.id)}
                      adding={categorieEnAjout === group.category.id}
                      onAddingChange={ouvert =>
                        setCategorieEnAjout(ouvert ? group.category.id : null)
                      }
                      onToggleNote={toggleNote}
                      onRename={name => void notes.renameCategory(group.category, name)}
                      onDelete={() => setConfirmCategory(group.category)}
                      onCreateNote={title => void notes.createNote(group.category.id, title)}
                      ficheEnGlisse={ficheGlissee !== null}
                      onSaveNote={(note, patch) => void notes.updateNote(note, patch)}
                      onDeleteNote={setConfirmNote}
                    />
                  ))}
                </div>
              </SortableContext>
              {/* Le même aperçu que l'arbre des pages : ce qu'on tient suit le
                  curseur, pendant que la place laissée libre s'ouvre dans la
                  liste. Une fiche dépliée ou une catégorie entière n'y tient
                  que par son intitulé — le reste encombrerait la colonne. */}
              <DragOverlay>
                {(categorieGlissee ?? ficheGlissee) && (
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-sm shadow-lg">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    <span className="truncate">
                      {categorieGlissee?.name ?? ficheGlissee?.title}
                    </span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {vide && (
            <div className="px-1 py-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {isEditMode ? t("emptyEdit") : t("emptyRead")}
              </p>
              {isEditMode && (
                <div className="flex flex-wrap gap-1">
                  {SUGGESTIONS.map(id => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => void notes.createCategory(t(`suggestions.${id}`))}
                      className="rounded-full border border-border-soft px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      + {t(`suggestions.${id}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isEditMode && !notes.loading && creatingCategory && (
            <input
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              onBlur={commitCategory}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitCategory(); }
                if (e.key === "Escape") { e.preventDefault(); setCategoryName(""); setCreatingCategory(false); }
              }}
              maxLength={DB_TEXT_LIMITS["world_wiki_page_note_categories.name"]}
              placeholder={t("categoryPlaceholder")}
              className="mt-2 w-full rounded-md border border-border-soft bg-transparent px-2 py-1 text-sm outline-none focus:border-primary/50"
              autoFocus
              disabled={notes.pending}
            />
          )}
      </div>

      {/* Pied de colonne, comme sous l'arbre des pages : les gestes de
          création y ont une place fixe au lieu de flotter à la fin d'une
          liste dont la longueur varie. */}
      {isEditMode && !notes.loading && (
        <div className={WIKI_FOOTER}>
          {notes.groups.length > 0 && (
            <button
              type="button"
              // La dernière catégorie plutôt que la première : c'est celle qui
              // borde le pied, donc celle qu'on désigne en cliquant là.
              onClick={() => {
                const derniere = notes.groups[notes.groups.length - 1].category.id;
                expandCategory(derniere);
                setCategorieEnAjout(derniere);
              }}
              className={WIKI_FOOTER_BUTTON}
            >
              <FilePlus className="h-3.5 w-3.5" /> {t("noteLabel")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreatingCategory(true)}
            className={WIKI_FOOTER_BUTTON}
          >
            <FolderPlus className="h-3.5 w-3.5" /> {t("categoryLabel")}
          </button>
        </div>
      )}
    </>
  );
}
