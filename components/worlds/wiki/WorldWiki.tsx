"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { saveWorldPrefs } from "@/app/(protected)/w/actions";
import {
  BookOpenText,
  PanelLeft,
  PanelLeftClose,
  Check,
  FileText,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Library,
  Loader2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
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
import { WikiPageContent } from "./WikiPageContent";
import { WorldLexiconManager } from "./WorldLexiconManager";
import { WikiBreadcrumb } from "./WikiBreadcrumb";
import { WikiSearchBar, type WikiSearchResult } from "./WikiSearchBar";
import { WikiTemplatePicker } from "./WikiTemplatePicker";
import { WIKI_TEMPLATE_ICONS, type WikiTemplateId } from "@/lib/wikiTemplates";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { WIKI_FOOTER, WIKI_FOOTER_BUTTON, WIKI_SUBHEADER, WIKI_SUBHEADER_COUNT } from "./wikiSubHeader";
import { WikiEditModeToggle } from "./WikiEditModeToggle";
import { slugify } from "@/lib/slug";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useColumnResize } from "@/hooks/useColumnResize";
import type { WorldLexiconTerm } from "@/types/worlds";

const WIKI_NAV_MIN = 120;
const WIKI_NAV_MAX = 360;
const WIKI_NAV_DEFAULT = 208;

// Bornes de la colonne latérale (commentaires et notes). Le plancher tient
// compte de la barre d'onglets ; le plafond garde au texte de l'article de
// quoi rester lisible.
const WIKI_PANEL_MIN = 240;
const WIKI_PANEL_MAX = 560;
const WIKI_PANEL_DEFAULT = 320;

export type WikiPage = {
  id: string;
  world_id: string;
  parent_id: string | null;
  title: string;
  /** Image d'ouverture, pleine largeur au-dessus du titre (migration 143). */
  banner_url: string | null;
  /** Chapeau de la page, borné à 255 caractères (migration 143). */
  description: string | null;
  slug: string;
  content: string | null;
  is_folder: boolean;
  sort_index: number;
  icon: string | null;
  is_restricted: boolean;
  draft_updated_at: string | null;
  published_at: string | null;
};

/** Colonnes chargées en masse — exclut volontairement `draft_content` :
 *  ce champ n'est récupéré qu'à la demande (entrée en édition d'une page),
 *  pour ne jamais transférer de texte de brouillon à qui ne devrait pas l'avoir. */
const WIKI_PAGE_COLUMNS =
  "id, world_id, parent_id, title, slug, content, is_folder, sort_index, icon, is_restricted, " +
  "banner_url, description, draft_updated_at, published_at";

/** Normalise pour une recherche insensible à la casse et aux diacritiques (sans slugifier les espaces). */
function normalizeForSearch(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Première page du wiki dans l'ordre de lecture de l'arbre : on descend les
 * racines par `sort_index`, en entrant dans chaque dossier avant de passer au
 * suivant. Les dossiers eux-mêmes ne comptent pas — ils n'ont pas de contenu à
 * afficher. Renvoie `null` sur un wiki qui n'a que des dossiers, ou rien.
 */
export function firstPageOf(pages: WikiPage[]): WikiPage | null {
  const enfantsDe = (parentId: string | null) =>
    pages
      .filter(p => p.parent_id === parentId)
      .sort((a, b) => a.sort_index - b.sort_index);

  function descendre(parentId: string | null): WikiPage | null {
    for (const page of enfantsDe(parentId)) {
      if (!page.is_folder) return page;
      const dedans = descendre(page.id);
      if (dedans) return dedans;
    }
    return null;
  }

  return descendre(null);
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
  onToggleRestricted: () => void;
};

function SortableTreeNode({
  page, depth, isSelected, isExpanded, isRenaming, renameValue, renameIcon,
  editMode, subtree, createInput, onSelect, onToggleFolder, onStartRename,
  onRenameChange, onRenameIconChange, onConfirmRename, onCancelRename,
  onDelete, onCreateInFolder, onToggleRestricted,
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
    // `gap-0.5` ici comme sur les deux autres conteneurs de l'arbre : l'écart
    // entre deux lignes doit être le même qu'elles soient sœurs, ou qu'un
    // dossier sépare l'une de l'autre.
    <div ref={setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div
        className={cn(
          "flex cursor-pointer select-none items-center gap-1.5 rounded-md py-1 text-sm",
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
                  <LazyLucideIcon name={renameIcon} className="h-3.5 w-3.5" />
                ) : page.is_folder ? (
                  <Folder className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
              </button>
            }
          />
        ) : page.icon && VALID_LUCIDE_ICONS.has(page.icon) ? (
          <LazyLucideIcon name={page.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
          // Le titre porte l'action, pas la ligne. La ligne reste cliquable —
          // c'est une cible large, agréable à la souris — mais elle ne peut pas
          // devenir un `<button>` : elle contient déjà une poignée de
          // déplacement, un sélecteur d'icône et un menu, et imbriquer des
          // commandes dans un bouton produit un balisage invalide qu'un lecteur
          // d'écran ne sait pas restituer.
          //
          // `stopPropagation` est indispensable : sans lui le clic remonterait
          // à la ligne et `onToggleFolder` s'exécuterait deux fois, donc
          // s'annulerait — un dossier refuserait de s'ouvrir.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (page.is_folder) onToggleFolder();
              else onSelect();
            }}
            aria-expanded={page.is_folder ? isExpanded : undefined}
            aria-current={isSelected && !page.is_folder ? "page" : undefined}
            className={cn(
              "flex-1 truncate text-left outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm",
              page.is_folder && "font-medium text-foreground/80",
            )}
          >
            {page.title}
          </button>
        )}

        {!isRenaming && page.is_restricted && (
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        )}

        {editMode && !isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={e => e.stopPropagation()}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
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
              {/* Une page se renomme depuis son propre corps, où l'on voit
                  le titre qu'on change. Un dossier n'a pas de corps : il garde
                  donc son renommage ici. */}
              {page.is_folder && (
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onStartRename(); }}>
                  <Pencil className="mr-2 h-4 w-4" /> {t("rename")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onToggleRestricted(); }}>
                {page.is_restricted
                  ? <><LockOpen className="mr-2 h-4 w-4" /> {t("unmarkRestricted")}</>
                  : <><Lock className="mr-2 h-4 w-4" /> {t("markRestricted")}</>
                }
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); afterMenuClose(onDelete)(); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {page.is_folder && isExpanded && (
        <div className="flex flex-col gap-0.5">
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
  initialPanelWidth,
  label,
  initialSlug,
}: {
  worldId: string;
  canEdit: boolean;
  initialSidebarWidth?: number;
  /** Largeur retenue de la colonne latérale d'une page (migration 141). */
  initialPanelWidth?: number;
  /** Libellé personnalisé du monde pour ce panneau (ex: "Compendium") — vide = libellé traduit par défaut. */
  label?: string | null;
  /** Slug à sélectionner à l'arrivée (ex: lien "raccourci" depuis l'accueil du monde). */
  initialSlug?: string | null;
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("worlds.nav");
  const supabase = React.useMemo(() => createClient(), []);
  const reconnectEpoch = useReconnectEpoch();
  const [pages, setPages] = React.useState<WikiPage[] | null>(null);
  const [lexiconTerms, setLexiconTerms] = React.useState<WorldLexiconTerm[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [editMode, setEditMode] = React.useState(false);

  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<WikiPage | null>(null);

  const [lexiconManagerOpen, setLexiconManagerOpen] = React.useState(false);
  /** Arbre des pages en tiroir, en dessous de `lg`. */
  const [treeOpen, setTreeOpen] = React.useState(false);

  // Colonne de navigation repliée. Un confort de lecture propre à chacun : il
  // vit en local, pas en base, comme le pli des catégories de notes.
  const [navCollapsed, setNavCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setNavCollapsed(localStorage.getItem(`wiki-nav-collapsed:${worldId}`) === "1");
    } catch { /* mode privé : la colonne reste ouverte */ }
  }, [worldId]);

  function replierNav(replie: boolean) {
    setNavCollapsed(replie);
    try {
      localStorage.setItem(`wiki-nav-collapsed:${worldId}`, replie ? "1" : "0");
    } catch { /* rien à retenir, ce n'est pas grave */ }
  }

  const [creating, setCreating] = React.useState<{ parentId: string | null; isFolder: boolean } | null>(null);
  const [createTitle, setCreateTitle] = React.useState("");
  const createInputRef = React.useRef<HTMLInputElement>(null);

  const [createIcon, setCreateIcon] = React.useState("");
  const [renameIcon, setRenameIcon] = React.useState("");
  const [createTemplate, setCreateTemplate] = React.useState<WikiTemplateId | null>(null);
  const tTemplates = useTranslations("wiki.templates");

  const [searchQuery, setSearchQuery] = React.useState("");

  // ── Colonnes redimensionnables ────────────────────────────
  // L'arbre de navigation et la colonne latérale d'une page partagent le même
  // geste ; seule diffère la poignée, à droite de l'un et à gauche de l'autre.
  const { width: navWidth, handleProps: navHandleProps } = useColumnResize({
    initialWidth: initialSidebarWidth ?? WIKI_NAV_DEFAULT,
    min: WIKI_NAV_MIN,
    max: WIKI_NAV_MAX,
    side: "right",
    onCommit: w => void saveWorldPrefs(worldId, { wiki_sidebar_width: w }),
  });

  const { width: panelWidth, handleProps: panelHandleProps } = useColumnResize({
    initialWidth: initialPanelWidth ?? WIKI_PANEL_DEFAULT,
    min: WIKI_PANEL_MIN,
    max: WIKI_PANEL_MAX,
    side: "left",
    onCommit: w => void saveWorldPrefs(worldId, { wiki_panel_width: w }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    const { data, error } = await supabase
      .from("world_wiki_pages")
      .select(WIKI_PAGE_COLUMNS)
      .eq("world_id", worldId)
      .order("sort_index", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setPages(data as WikiPage[]);
  }

  React.useEffect(() => { void load(); }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lexique ───────────────────────────────────────────────────
  React.useEffect(() => {
    const loadLexicon = async () => {
      const { data, error } = await supabase
        .from("world_lexicon_terms")
        .select("id, world_id, term, description")
        .eq("world_id", worldId)
        .order("term", { ascending: true });
      if (error) { toast.error(error.message); return; }
      setLexiconTerms((data as WorldLexiconTerm[] | null) ?? []);
    };

    void loadLexicon();

    const channel = supabase
      .channel(`world_lexicon_terms:${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "world_lexicon_terms", filter: `world_id=eq.${worldId}` },
        () => void loadLexicon(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worldId, supabase, reconnectEpoch]);

  // Sélectionne `initialSlug` une fois les pages chargées (ex: arrivée depuis
  // un raccourci de l'accueil du monde) — une seule fois, pour ne pas revenir
  // sur cette page à chaque rechargement de `pages` (edit, suppression…).
  const initialSlugConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialSlug || initialSlugConsumedRef.current || !pages) return;
    initialSlugConsumedRef.current = true;
    navigateToSlug(initialSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlug, pages]);

  // Arrivée sur le wiki sans destination : on ouvre la première page plutôt
  // que d'accueillir sur un panneau vide. Une seule fois — sinon supprimer la
  // page ouverte y ramènerait aussitôt, et l'on ne pourrait plus rien fermer.
  const firstPageConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (firstPageConsumedRef.current || !pages || selectedId || initialSlug) return;
    firstPageConsumedRef.current = true;
    const premiere = firstPageOf(pages);
    if (premiere) selectPageById(premiere.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, selectedId, initialSlug]);

  React.useEffect(() => {
    if (creating) {
      setCreateTitle("");
      setCreateIcon("");
      setCreateTemplate(null);
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [creating]);

  // Leaving edit mode clears transient editing state
  React.useEffect(() => {
    if (!editMode) {
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
  async function createPage(
    parentId: string | null,
    title: string,
    isFolder: boolean,
    icon: string,
    templateContent?: string,
  ) {
    const siblings = childrenOf(parentId);
    const sort_index = siblings.length;

    let slug = slugify(title);
    const existingSlugs = new Set((pages ?? []).map(p => p.slug));
    if (existingSlugs.has(slug)) {
      let n = 2;
      while (existingSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }

    const insertPayload: Record<string, unknown> = {
      world_id: worldId, parent_id: parentId, title, slug, is_folder: isFolder, sort_index, icon: icon || null,
    };
    if (templateContent) {
      insertPayload.draft_content = templateContent;
      insertPayload.draft_updated_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("world_wiki_pages")
      .insert(insertPayload)
      .select(WIKI_PAGE_COLUMNS)
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
    const previousTitle = page.title;
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({ title, icon })
      .eq("id", page.id);
    if (error) { toast.error(error.message); return; }
    setPages(prev => prev?.map(p => p.id === page.id ? { ...p, title, icon } : p) ?? null);
    setRenamingId(null);

    // Met à jour en cascade les liens internes [[Ancien titre]] des autres
    // pages du monde (contenu publié + brouillon) — sinon ils cassent
    // silencieusement sans que personne ne le remarque.
    if (title !== previousTitle) {
      const { data: updatedCount, error: cascadeError } = await supabase.rpc("wwp_rename_cascade", {
        p_world_id: worldId,
        p_old_title: previousTitle,
        p_new_title: title,
      });
      if (cascadeError) { toast.error(cascadeError.message); return; }
      if (typeof updatedCount === "number" && updatedCount > 0) {
        toast.success(t("renameCascadeUpdated", { count: updatedCount }));
        void load();
      }
    }
  }

  async function toggleRestricted(page: WikiPage) {
    const is_restricted = !page.is_restricted;
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({ is_restricted })
      .eq("id", page.id);
    if (error) { toast.error(error.message); return; }
    setPages(prev => prev?.map(p => p.id === page.id ? { ...p, is_restricted } : p) ?? null);
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

  function onPageUpdated(patch: Partial<WikiPage> & { id: string }) {
    setPages(prev => prev?.map(p => p.id === patch.id ? { ...p, ...patch } : p) ?? null);
  }

  /** Ids des dossiers ancêtres d'une page, du plus proche au plus ancien. */
  function ancestorIdsOf(pageId: string): string[] {
    const ids: string[] = [];
    let parentId = pages?.find(p => p.id === pageId)?.parent_id ?? null;
    while (parentId) {
      ids.push(parentId);
      parentId = pages?.find(p => p.id === parentId)?.parent_id ?? null;
    }
    return ids;
  }

  /** Pages des dossiers ancêtres, du plus ancien au plus proche (fil d'Ariane). */
  function ancestorsOf(page: WikiPage): WikiPage[] {
    return ancestorIdsOf(page.id)
      .reverse()
      .map(id => pages?.find(p => p.id === id))
      .filter((p): p is WikiPage => !!p);
  }

  /** Sélectionne une page et déplie tous ses dossiers ancêtres dans la sidebar. */
  function selectPageById(pageId: string) {
    const target = pages?.find(p => p.id === pageId);
    if (!target) return;
    // Sur téléphone, l'arbre couvre l'article : le laisser ouvert cacherait la
    // page qu'on vient de choisir.
    setTreeOpen(false);
    const ids = ancestorIdsOf(target.id);
    if (ids.length) setExpandedFolders(prev => new Set([...prev, ...ids]));
    setSelectedId(target.id);
  }

  /** Déplie un dossier (et ses propres ancêtres) sans changer la sélection — utilisé par le fil d'Ariane. */
  function expandFolderChain(folderId: string) {
    setExpandedFolders(prev => new Set([...prev, folderId, ...ancestorIdsOf(folderId)]));
  }

  /** Navigue vers la page ciblée par un lien interne `[[Titre]]`. */
  function navigateToSlug(slug: string) {
    const target = pages?.find(p => p.slug === slug);
    if (target) selectPageById(target.id);
  }

  function selectSearchResult(pageId: string) {
    selectPageById(pageId);
    setSearchQuery("");
  }

  const searchResults = React.useMemo<WikiSearchResult[] | null>(() => {
    const q = normalizeForSearch(searchQuery.trim());
    if (!q) return null;

    return (pages ?? [])
      .filter(p => !p.is_folder)
      .map((p): WikiSearchResult | null => {
        const titleMatch = normalizeForSearch(p.title).includes(q);
        const contentNorm = p.content ? normalizeForSearch(p.content) : "";
        const contentIdx = contentNorm.indexOf(q);
        if (!titleMatch && contentIdx === -1) return null;

        let excerpt = "";
        if (!titleMatch && contentIdx !== -1 && p.content) {
          const start = Math.max(0, contentIdx - 30);
          excerpt = (start > 0 ? "…" : "") + p.content.slice(start, start + 90).trim() + "…";
        }

        return {
          page: p,
          path: ancestorsOf(p).map(a => a.title).join(" / "),
          excerpt,
        };
      })
      .filter((r): r is WikiSearchResult => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, pages]);

  // ── DnD ──────────────────────────────────────────────────────
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !pages) return;
    // Ordre d'origine, pour le rétablir si l'écriture est refusée.
    const previousPages = pages;

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
      // Même précaution que pour le réordonnancement : sans lire l'erreur, la
      // page paraissait rangée dans le dossier et en ressortait au
      // rechargement suivant.
      void supabase
        .from("world_wiki_pages")
        .update({ parent_id: overPage.id, sort_index })
        .eq("id", activePage.id)
        .then(({ error }: { error: { message: string } | null }) => {
          if (!error) return;
          setPages(previousPages);
          toast.error(t("saveError"), { description: error.message });
        });
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

    // Un `update` par ligne, et surtout PAS un `upsert` : PostgREST traduit
    // l'upsert en `INSERT … ON CONFLICT`, si bien que la RLS évalue la policy
    // d'INSERT sur une ligne où `world_id` est absent — donc nul. La
    // vérification `is_world_editor(world_id, …)` échouait alors pour tout le
    // monde, propriétaire compris, et réordonner une page répondait
    // « new row violates row-level security policy ». L'UPDATE, lui, ne touche
    // qu'à `sort_index` et laisse `world_id` en place.
    //
    // Le résultat de l'écriture est lu : un refus laissait sinon le nouvel
    // ordre à l'écran, perdu au rechargement suivant.
    void Promise.all(
      updates.map(u =>
        supabase.from("world_wiki_pages").update({ sort_index: u.sort_index }).eq("id", u.id),
      ),
    ).then((resultats: { error: { message: string } | null }[]) => {
      const erreur = resultats.map(r => r.error).find(Boolean);
      if (!erreur) return;
      setPages(previousPages);
      toast.error(t("saveError"), { description: erreur.message });
    });
  }

  const selectedPage = pages?.find(p => p.id === selectedId) ?? null;
  const isEditMode = editMode && canEdit;

  // ── Tree ─────────────────────────────────────────────────────
  function renderCreateInput(parentId: string | null, depth: number) {
    const isFolder = creating?.isFolder ?? false;
    const templateContent = createTemplate ? tTemplates.raw(`${createTemplate}.content`) as string : undefined;
    return (
      <div className="rounded-md px-2 py-1" style={{ paddingLeft: `${0.5 + depth}rem` }}>
        <div className="flex items-center gap-1.5">
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
                  <LazyLucideIcon name={createIcon} className="h-3.5 w-3.5" />
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
                void createPage(parentId, createTitle.trim(), isFolder, createIcon, templateContent);
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
        {!isFolder && (
          <div className="mt-1 pl-6">
            <WikiTemplatePicker
              value={createTemplate}
              onChange={id => {
                setCreateTemplate(id);
                if (id) setCreateIcon(WIKI_TEMPLATE_ICONS[id]);
              }}
            />
          </div>
        )}
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
              // `selectPageById` et non `setSelectedId` : lui seul déplie les
              // dossiers ancêtres et referme le tiroir mobile. Sans cela, sur
              // téléphone, choisir une page la sélectionnait sous un tiroir
              // resté ouvert — rien ne semblait se passer.
              onSelect={() => selectPageById(page.id)}
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
              onToggleRestricted={() => void toggleRestricted(page)}
            />
          );
        })}
        {creating?.parentId === parentId && parentId === null && renderCreateInput(null, depth)}
      </SortableContext>
    );
  }

  // Le même arbre sert la colonne de gauche et le tiroir mobile : les deux
  // doivent rester rigoureusement identiques, glisser-déposer compris.
  const arbreDesPages = (dansTiroir = false) => (
    <>
      {/* Segment gauche du bandeau : la recherche, et de quoi replier la
          colonne. Les commandes de création sont juste en dessous — à 208 px,
          la recherche et trois boutons ne tiennent pas sur une ligne. */}
      {/* Dans le tiroir, le trait du bandeau n'a plus rien à aligner : les
          deux autres colonnes ne sont pas là. */}
      <div className={cn(WIKI_SUBHEADER, dansTiroir && "shadow-none")}>
        <div className="min-w-0 flex-1">
          <WikiSearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            results={searchResults}
            onSelectResult={selectSearchResult}
          />
        </div>
        <button
          type="button"
          onClick={() => replierNav(true)}
          aria-label={t("collapsePages")}
          title={t("collapsePages")}
          className="hidden shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground lg:block"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {pages === null ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : searchQuery.trim() === "" ? (
          <nav className="flex flex-col gap-0.5 px-1">
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              {renderTree(null)}
            </DndContext>
            {pages.length === 0 && !creating && (
              <p className="px-2 py-1 text-xs italic text-muted-foreground">{t("noPages")}</p>
            )}
          </nav>
        ) : null}
      </div>
      {/* Monté seulement en écriture : hors de ce mode il ne restait qu'un
          filet et une bande vide au bas de la colonne. */}
      {isEditMode && (
        <div
          data-testid="wiki-nav-footer"
          className={WIKI_FOOTER}
        >
          <button
            type="button"
            onClick={() => setCreating({ parentId: null, isFolder: false })}
            className={WIKI_FOOTER_BUTTON}
          >
            <FilePlus className="h-3.5 w-3.5" /> {t("newPage")}
          </button>
          <button
            type="button"
            onClick={() => setCreating({ parentId: null, isFolder: true })}
            className={WIKI_FOOTER_BUTTON}
          >
            <FolderPlus className="h-3.5 w-3.5" /> {t("newFolder")}
          </button>
          <button
            type="button"
            onClick={() => setLexiconManagerOpen(true)}
            aria-label={t("lexicon.manageButton")}
            title={t("lexicon.manageButton")}
            className={cn(WIKI_FOOTER_BUTTON, "ml-auto")}
          >
            <Library className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );

  const pageCount = pages?.filter(p => !p.is_folder).length ?? 0;
  const compteurDesPages = pageCount > 0 && (
    <span className={WIKI_SUBHEADER_COUNT}>{pageCount}</span>
  );

  // ── Content ──────────────────────────────────────────────────
  function renderContent() {
    if (!selectedPage || selectedPage.is_folder) {
      return (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Bandeau vide, mais présent : c'est lui qui aligne le trait avec
              les deux autres colonnes quand aucune page n'est ouverte. */}
          <div className={WIKI_SUBHEADER}>
            <button
              type="button"
              onClick={() => setTreeOpen(true)}
              aria-label={t("openPages")}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
            >
              <PanelLeft className="h-3.5 w-3.5" /> {t("pagesLabel")}
              {compteurDesPages}
            </button>
            {navCollapsed && (
              <button
                type="button"
                onClick={() => replierNav(false)}
                aria-label={t("expandPages")}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground hidden lg:flex"
              >
                <PanelLeft className="h-3.5 w-3.5" /> {t("pagesLabel")}
                {compteurDesPages}
              </button>
            )}
          </div>
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {!pages?.length
                ? isEditMode
                  ? t("emptyEdit")
                  : t("emptyRead")
                : t("selectPage")}
            </p>
          </div>
        </div>
      );
    }

    return (
      <WikiPageContent
        key={selectedPage.id}
        page={selectedPage}
        worldId={worldId}
        panelWidth={panelWidth}
        panelHandleProps={panelHandleProps}
        navCollapsed={navCollapsed}
        onExpandNav={() => replierNav(false)}
        onOpenTree={() => setTreeOpen(true)}
        pageCount={pageCount}
        pages={pages ?? []}
        canEdit={canEdit}
        isEditMode={isEditMode}
        onExitEditMode={() => setEditMode(false)}
        supabase={supabase}
        onPageUpdated={onPageUpdated}
        onRename={(title, icon) => void renamePage(selectedPage, title, icon)}
        onNavigate={navigateToSlug}
        lexiconTerms={lexiconTerms}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <DeleteConfirmDialog
        open={!!confirmDelete}
        onOpenChange={open => { if (!open) setConfirmDelete(null); }}
        title={t("deleteTitle", { title: confirmDelete?.title ?? "" })}
        description={`${confirmDelete?.is_folder ? t("deleteFolderDesc") : t("deletePageDesc")} ${t("deleteIrreversible")}`}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => {
          if (confirmDelete) void deletePage(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      <WorldLexiconManager
        open={lexiconManagerOpen}
        onOpenChange={setLexiconManagerOpen}
        worldId={worldId}
        supabase={supabase}
        terms={lexiconTerms}
      />

      {/* Arbre des pages en tiroir, en dessous de `lg` */}
      <Drawer open={treeOpen} onOpenChange={setTreeOpen} swipeDirection="left">
        <DrawerContent className="inset-y-0 left-0 flex flex-col gap-0 rounded-md border bg-background p-0 text-foreground shadow-lg w-[min(calc(100%_-_var(--drawer-inset)*2),_320px)]">
          {/* Le tiroir n'affiche pas d'en-tête : il porte déjà le bandeau de
              la colonne, avec sa recherche, et répéter le nom du wiki juste
              sous celui de l'en-tête principal ne disait rien de plus. Le
              titre reste, masqué : Radix l'exige pour nommer le dialogue aux
              lecteurs d'écran. */}
          <VisuallyHidden>
            <DrawerTitle>{label || tNav("wiki")}</DrawerTitle>
          </VisuallyHidden>
          {arbreDesPages(true)}
        </DrawerContent>
      </Drawer>

      {/* `min-w-0` : un élément de flex refuse par défaut de descendre sous la
          largeur minimale de son contenu. Cette colonne restait donc à 532 px
          dans un parent de 455, qui la rognait — l'article se retrouvait coupé
          à droite sur écran étroit. */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <WorldPanelHeader
          icon={<BookOpenText className="h-4 w-4 shrink-0 text-muted-foreground" />}
          title={label || tNav("wiki")}
          right={canEdit && (
            <WikiEditModeToggle editMode={editMode} onToggle={() => setEditMode(v => !v)} />
          )}
        >
          {/* Le chemin de la page suit le nom du wiki, comme le nom d'un salon
              suit celui de son monde : même geste, même lecture. */}
          {selectedPage && (
            <WikiBreadcrumb
              ancestors={ancestorsOf(selectedPage)}
              onExpandFolder={expandFolderChain}
            />
          )}
        </WorldPanelHeader>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Colonne de navigation — devient un tiroir en dessous de `lg`, où
              ses 208 px prenaient plus de la moitié d'un écran de téléphone. */}
          {!navCollapsed && (
            <div
              className="hidden shrink-0 flex-col border-r border-border-soft lg:flex"
              style={{ width: navWidth }}
            >
              {arbreDesPages()}
            </div>
          )}

          {/* Handle de redimensionnement — en mode modification, et seulement
              là où la colonne existe. */}
          {isEditMode && !navCollapsed && (
            <div
              className="group relative hidden w-2 shrink-0 cursor-col-resize select-none lg:block"
              {...navHandleProps}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-soft transition-colors group-hover:bg-border" />
            </div>
          )}

          {/* Content area */}
          <div className="flex min-h-0 min-w-0 flex-1">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}
