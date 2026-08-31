"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, History, Loader2, Lock, PanelLeft, PanelRight, Pencil } from "lucide-react";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { LucideIconPicker, VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { CodeEditor } from "@/components/ui/code-editor";
import { appliquerFormat, raccourciDe, type NomFormat } from "@/lib/markdownFormatting";
import { ecrireAvecAnnulation } from "@/lib/textareaEdit";
import { toast } from "sonner";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { cn } from "@/lib/utils";
import type { createClient } from "@/lib/supabase/client";
import { resolveWikiLinks } from "@/lib/wikiLinks";
import { extractHeadings } from "@/lib/wikiToc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MEDIA, useMediaQuery } from "@/hooks/useMediaQuery";
import { useWikiAnnotations } from "@/hooks/useWikiAnnotations";
import { useWikiPageNotes } from "@/hooks/useWikiPageNotes";
import type { BlockAnchor } from "@/lib/wikiBlockAnchors";
import type { WikiAnnotation } from "@/types/worlds";
import { WikiAnnotationLayer, type ActiveAnnotation } from "./WikiAnnotationLayer";
import { WikiAnnotationsPanel, type AnnotationDraft } from "./WikiAnnotationsPanel";
import { WikiNotesPanel } from "./WikiNotesPanel";
import { WikiSidePanel, type WikiSideTab } from "./WikiSidePanel";
import { WikiFormatToolbar } from "./WikiFormatToolbar";
import { WIKI_SUBHEADER, WIKI_SUBHEADER_COUNT } from "./wikiSubHeader";
import { WikiTableOfContents } from "./WikiTableOfContents";
import { WikiVersionHistoryPanel } from "./WikiVersionHistoryPanel";
import type { WikiPage } from "./WorldWiki";
import type { WorldLexiconTerm } from "@/types/worlds";

/** Délai d'autosauvegarde du brouillon après la dernière frappe. */
const WIKI_AUTOSAVE_DELAY = 1800;

/**
 * Échelle de titres du contenu markdown, redéfinie pour rester subordonnée
 * au titre de page (text-2xl juste en dessous) : les tailles par défaut du
 * plugin Typography (ex: un `## …` en prose-base atteint ~24px/700, aussi
 * gros voire plus gros que l'ancien titre de page en text-xl/600) cassaient
 * la hiérarchie visuelle. Les sélecteurs `[&_h2]` ciblent l'élément avec une
 * spécificité normale, qui l'emporte sur les règles du plugin (wrappées en
 * `:where()`, spécificité nulle, précisément pour rester surchargeables).
 */
const WIKI_PROSE_HEADING_CLASSES = cn(
  "[&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:text-base [&_h3]:font-semibold",
  "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-muted-foreground",
  "[&_h5]:text-sm [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:tracking-wide [&_h5]:text-muted-foreground",
  "[&_h6]:text-sm [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-wide [&_h6]:text-muted-foreground",
);

function isDraftNewer(page: WikiPage): boolean {
  if (!page.draft_updated_at) return false;
  if (!page.published_at) return true;
  return new Date(page.draft_updated_at) > new Date(page.published_at);
}

export function WikiPageContent({
  page,
  worldId,
  panelWidth,
  panelHandleProps,
  navCollapsed,
  onExpandNav,
  onOpenTree,
  pageCount,
  onRename,
  pages,
  canEdit,
  isEditMode,
  onExitEditMode,
  supabase,
  onPageUpdated,
  onNavigate,
  lexiconTerms,
}: {
  page: WikiPage;
  /** Monde de la page — dénormalisé sur les annotations (voir migration 137). */
  worldId: string;
  /** Largeur de la colonne latérale, réglée depuis WorldWiki. */
  panelWidth: number;
  /** Gestionnaires de la poignée de redimensionnement (voir useColumnResize). */
  panelHandleProps: React.ComponentProps<"div">;
  /** Colonne de navigation repliée : son bouton de réouverture vient ici. */
  navCollapsed: boolean;
  onExpandNav: () => void;
  /** Ouvre l'arbre en tiroir — le geste équivalent en dessous de `lg`. */
  onOpenTree: () => void;
  /** Nombre de pages du wiki, annoncé sur le bouton quand l'arbre est fermé. */
  pageCount: number;
  /** Renomme la page (titre et icône) — la cascade des liens internes vers
   *  l'ancien titre est faite par l'appelant, voir `WorldWiki.renamePage`. */
  onRename: (title: string, icon: string) => void;
  /** Toutes les pages du wiki — pour résoudre les liens internes `[[Titre]]`. */
  pages: WikiPage[];
  /** Permission de l'utilisateur (owner/admin/editor) — indépendante du bascule de mode édition. */
  canEdit: boolean;
  /** Mode édition actif dans le panneau (bascule + permission). */
  isEditMode: boolean;
  /** Éteint cette bascule — publier ou annuler doit la relâcher aussi. */
  onExitEditMode: () => void;
  supabase: ReturnType<typeof createClient>;
  onPageUpdated: (patch: Partial<WikiPage> & { id: string }) => void;
  /** Navigue vers la page dont le slug est résolu depuis un lien interne. */
  onNavigate: (slug: string) => void;
  /** Lexique du monde — surligné automatiquement dans le contenu rendu. */
  lexiconTerms?: WorldLexiconTerm[];
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const tNotes = useTranslations("wiki.notes");

  const [editing, setEditing] = React.useState(false);
  const [loadingDraft, setLoadingDraft] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const champMarkdown = React.useRef<HTMLTextAreaElement>(null);
  /** Sélection à reposer une fois la valeur mise en forme rendue. */
  const [selectionAPoser, setSelectionAPoser] = React.useState<[number, number] | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = React.useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Titre et icône, modifiables dans le corps plutôt que dans une ligne
  // d'arbre de deux cents pixels.
  const [renameTitle, setRenameTitle] = React.useState(page.title);
  const [renameIcon, setRenameIcon] = React.useState(page.icon ?? "");

  /**
   * Le titre en tant que champ. Servi sur demande en lecture (menu ⋯), et
   * d'emblée en modification de l'article : on y écrit déjà le corps, exiger
   * un geste de plus pour le titre n'aurait servi à rien.
   */
  const champTitre = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <LucideIconPicker
        value={renameIcon}
        onChange={valeur => { setRenameIcon(valeur); onRename(renameTitle.trim() || page.title, valeur); }}
        trigger={
          <button
            type="button"
            title={t("changeIcon")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {renameIcon && VALID_LUCIDE_ICONS.has(renameIcon)
              ? <LazyLucideIcon name={renameIcon} className="h-5 w-5" />
              : <Pencil className="h-4 w-4" />}
          </button>
        }
      />
      <input
        value={renameTitle}
        onChange={e => setRenameTitle(e.target.value)}
        onBlur={validerRenommage}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === "Escape") { e.preventDefault(); setRenameTitle(page.title); }
        }}
        maxLength={DB_TEXT_LIMITS["world_wiki_pages.title"]}
        aria-label={t("pageTitlePlaceholder")}
        className="min-w-0 flex-1 border-b border-border bg-transparent text-2xl font-semibold outline-none focus:border-primary/50"
      />
    </div>
  );

  function validerRenommage() {
    const propre = renameTitle.trim();
    if (propre && (propre !== page.title || renameIcon !== (page.icon ?? ""))) {
      onRename(propre, renameIcon);
    }
  }

  // ── Annotations ───────────────────────────────────────────
  const { userId } = useCurrentUser();
  // Une seule colonne latérale, permanente, dont l'onglet dit ce qu'elle montre.
  // Elle s'ouvre sur les notes — le premier onglet, et ce qui accompagne
  // l'article ; commenter, lui, part d'une sélection dans le texte, qui bascule
  // d'elle-même sur l'onglet des commentaires.
  const [sideTab, setSideTab] = React.useState<WikiSideTab>("notes");
  /** La colonne passe en tiroir en dessous de `xl` — voir le rendu plus bas. */
  const [sideDrawerOpen, setSideDrawerOpen] = React.useState(false);
  // Un point de rupture lu en JS, et non une classe Tailwind : il faut que la
  // colonne ne soit pas MONTÉE sous `xl`, pas seulement cachée. Deux panneaux
  // de notes montés en même temps ouvrent deux fois le même canal Realtime, ce
  // que supabase-js refuse — et le panneau caché interrogeait la base pour rien.
  const colonneLaterale = useMediaQuery(MEDIA.xl);

  // Colonne latérale repliée — même confort local que pour la navigation.
  const [sideCollapsed, setSideCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setSideCollapsed(localStorage.getItem(`wiki-side-collapsed:${worldId}`) === "1");
    } catch { /* mode privé : la colonne reste ouverte */ }
  }, [worldId]);

  function replierPanneau(replie: boolean) {
    setSideCollapsed(replie);
    try {
      localStorage.setItem(`wiki-side-collapsed:${worldId}`, replie ? "1" : "0");
    } catch { /* rien à retenir */ }
  }

  // La colonne apparaît (élargissement, rotation d'une tablette) : le tiroir
  // n'a plus lieu d'être, et le laisser « ouvert » le ferait resurgir tout
  // seul au prochain rétrécissement.
  React.useEffect(() => {
    if (colonneLaterale) setSideDrawerOpen(false);
  }, [colonneLaterale]);
  const [activeAnnotation, setActiveAnnotation] = React.useState<ActiveAnnotation | null>(null);
  const [annotationDraft, setAnnotationDraft] = React.useState<AnnotationDraft | null>(null);
  const [detachedIds, setDetachedIds] = React.useState<Set<string>>(() => new Set());

  /**
   * Notes de la page, chargées ici plutôt que dans le panneau.
   *
   * Le sous-en-tête annonce leur nombre quand la colonne est fermée — donc
   * quand le panneau est démonté et ne peut rien charger. Une seule
   * souscription temps réel en découle, là où la colonne et le tiroir
   * pouvaient en ouvrir deux.
   */
  const notes = useWikiPageNotes({ pageId: page.id, worldId, supabase });
  const nombreDeNotes = notes.notes?.length ?? 0;

  const annotations = useWikiAnnotations({
    pageId: page.id,
    worldId,
    userId,
    supabase,
    // Chargées avec la page, pas à l'ouverture du panneau : les surlignages
    // sont le seul indice qu'une discussion existe. Attendre un clic sur
    // « Annotations » pour les afficher rendrait invisible, à qui ne pense
    // pas à ouvrir le panneau, tout ce que les autres ont écrit — y compris
    // le compteur censé l'y inviter.
    enabled: true,
  });

  // Le panneau se rouvre vide sur une autre page ; l'état transitoire doit
  // suivre, sinon un fil sélectionné ici resterait « actif » là-bas.
  React.useEffect(() => {
    setActiveAnnotation(null);
    setAnnotationDraft(null);
    setDetachedIds(new Set());
  }, [page.id]);

  function openAnnotation(id: string, scrollIntoView: boolean) {
    setSideTab("comments");
    setSideDrawerOpen(true);
    setActiveAnnotation({ id, scrollIntoView });
  }

  function startDraft(anchor: BlockAnchor) {
    setSideTab("comments");
    // Ouvrir le panneau là où il vit : la colonne quand elle est repliée, le
    // tiroir en dessous de `xl`. Le tiroir seul ne suffisait pas — son `open`
    // est conditionné à l'absence de colonne, si bien qu'à grande largeur
    // avec la colonne repliée, la saisie s'ouvrait hors de vue.
    replierPanneau(false);
    setSideDrawerOpen(true);
    setActiveAnnotation(null);
    setAnnotationDraft({ anchor });
  }

  async function createFromDraft(body: string) {
    if (!annotationDraft) return;
    const created = await annotations.createThread({ ...annotationDraft, body });
    setAnnotationDraft(null);
    if (created) setActiveAnnotation({ id: created.id, scrollIntoView: false });
  }

  // Le calcul vient d'un effet de mise en page ; ne remplacer l'ensemble que
  // s'il a réellement changé évite un rendu de plus à chaque passage.
  const onDetachedChange = React.useCallback((ids: string[]) => {
    setDetachedIds(prev => {
      if (prev.size === ids.length && ids.every(id => prev.has(id))) return prev;
      return new Set(ids);
    });
  }, []);

  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const dirtyRef = React.useRef(false);
  const autosaveTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort du mode édition transitoire quand le panneau quitte le mode modification.
  React.useEffect(() => {
    if (isEditMode) {
      // Le mode modification du wiki EST l'édition de l'article : demander un
      // second bouton pour ouvrir l'éditeur revenait à faire dire deux fois la
      // même chose. Vaut aussi au montage — changer de page en modification
      // rouvre l'éditeur sur la nouvelle, y compris celle qu'on vient de créer
      // depuis un modèle.
      void startEditing();
    } else {
      setEditing(false);
      setShowPreview(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  async function flushDraft(value: string) {
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({ draft_content: value, draft_updated_at: new Date().toISOString() })
      .eq("id", page.id);
    if (error) { toast.error(t("saveError"), { description: error.message }); return; }
    const now = new Date();
    setLastAutosavedAt(now);
    onPageUpdated({ id: page.id, draft_updated_at: now.toISOString() });
  }

  // Sauvegarde finale d'un brouillon non encore synchronisé si l'éditeur se
  // démonte pendant que le debounce est encore en attente (changement de page).
  React.useEffect(() => {
    return () => {
      if (autosaveTimeout.current) {
        clearTimeout(autosaveTimeout.current);
        if (dirtyRef.current) void flushDraft(draftRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!selectionAPoser) return;
    const champ = champMarkdown.current;
    if (champ) {
      champ.focus();
      champ.setSelectionRange(selectionAPoser[0], selectionAPoser[1]);
    }
    setSelectionAPoser(null);
  }, [selectionAPoser]);

  /**
   * Applique un format à la sélection du champ markdown.
   *
   * La sélection à reposer passe par un état plutôt que d'être écrite tout de
   * suite : le champ est contrôlé par React, et l'écrire avant que la nouvelle
   * valeur ne soit rendue la ferait écraser aussitôt.
   */
  function appliquerMiseEnForme(nom: NomFormat) {
    const champ = champMarkdown.current;
    if (!champ) return;

    const suite = appliquerFormat(
      { value: draft, start: champ.selectionStart, end: champ.selectionEnd },
      nom,
      tCommon("formatLinkText"),
    );

    // L'écriture passe par le navigateur quand il le permet : la mise en forme
    // rejoint alors sa pile d'annulation, et `onChange` nous rend la valeur.
    // Sinon seulement, on l'écrit nous-mêmes.
    if (!ecrireAvecAnnulation(champ, suite.value)) handleDraftChange(suite.value);
    setSelectionAPoser([suite.start, suite.end]);
  }

  function surToucheDuChamp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const nom = raccourciDe(e);
    if (!nom) return;
    e.preventDefault();
    appliquerMiseEnForme(nom);
  }

  function handleDraftChange(v: string) {
    setDraft(v);
    dirtyRef.current = true;
    if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = setTimeout(() => void flushDraft(v), WIKI_AUTOSAVE_DELAY);
  }

  async function startEditing() {
    // Le titre est modifiable d'emblée : son champ doit partir de la valeur
    // courante, pas de celle d'un renommage abandonné plus tôt.
    setRenameTitle(page.title);
    setRenameIcon(page.icon ?? "");
    setEditing(true);
    setLoadingDraft(true);
    const { data, error } = await supabase
      .from("world_wiki_pages")
      .select("draft_content")
      .eq("id", page.id)
      .single();
    setLoadingDraft(false);
    if (error) {
      toast.error(error.message);
      setDraft(page.content ?? "");
      return;
    }
    setDraft((data?.draft_content as string | null) ?? page.content ?? "");
    dirtyRef.current = false;
  }

  /**
   * Ferme l'éditeur ET la bascule du wiki.
   *
   * Les deux ne font qu'un depuis que le mode modification ouvre l'article :
   * fermer l'un sans l'autre laissait la page en lecture et le bouton
   * « Modifier » allumé, état d'où l'on ne ressortait qu'en le basculant deux
   * fois.
   */
  function quitterLaModification() {
    setEditing(false);
    onExitEditMode();
  }

  async function publish() {
    if (autosaveTimeout.current) { clearTimeout(autosaveTimeout.current); autosaveTimeout.current = null; }
    dirtyRef.current = false;
    setPublishing(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("world_wiki_pages")
      .update({
        content: draft,
        draft_content: draft,
        draft_updated_at: nowIso,
        published_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", page.id);
    setPublishing(false);
    if (error) { toast.error(t("saveError"), { description: error.message }); return; }
    onPageUpdated({ id: page.id, content: draft, draft_updated_at: nowIso, published_at: nowIso });
    setLastAutosavedAt(new Date());
    quitterLaModification();
  }

  const pageIcon = page.icon && VALID_LUCIDE_ICONS.has(page.icon)
    ? <LazyLucideIcon name={page.icon} className="h-5 w-5 shrink-0 text-muted-foreground" />
    : null;

  const resolvedContent = React.useMemo(
    () => resolveWikiLinks(page.content ?? "", pages),
    [page.content, pages],
  );
  // Extrait depuis le même texte que celui rendu (resolvedContent), pour que
  // les ids d'ancre du sommaire correspondent exactement à ceux posés par
  // MarkdownRenderer sur les titres (voir MarkdownRenderer.tsx).
  const headings = React.useMemo(() => extractHeadings(resolvedContent), [resolvedContent]);

  // Identité du texte rendu : elle pilote le remontage de la couche
  // d'annotations (voir WikiAnnotationLayer). Toute écriture du contenu passe
  // par une publication, qui déplace `published_at` — inutile de hacher la
  // page entière à chaque rendu pour s'en apercevoir.
  const contentKey = `${page.id}|${page.published_at ?? ""}|${resolvedContent.length}`;

  // Seul un membre identifié peut annoter : la RLS exige `author_id = auth.uid()`.
  const canAnnotate = userId !== null;
  const openAnnotationCount = annotations.threads.filter(
    th => th.root.resolved_at === null,
  ).length;

  const draftBadge = canEdit && isDraftNewer(page) && (
    <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {t("draftBadge")}
    </span>
  );

  // RLS garantit qu'un lecteur non-éditeur ne reçoit jamais de page
  // is_restricted — pas besoin de conditionner l'affichage sur `canEdit` ici.
  const restrictedBadge = page.is_restricted && (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Lock className="h-3 w-3" /> {t("restrictedBadge")}
    </span>
  );

  // Segment central du bandeau : d'où l'on vient. Il coiffe la lecture comme
  // l'édition, pour que le trait ne se déplace pas d'une vue à l'autre.
  // Ce que le bouton cache, annoncé sur le bouton : il n'apparaît que quand la
  // colonne est fermée, et rien d'autre ne dirait alors ce qu'elle contient.
  const compteurDesPages = pageCount > 0 && (
    <span className={WIKI_SUBHEADER_COUNT}>{pageCount}</span>
  );

  /**
   * Compteur du bouton de la colonne latérale, accordé à son libellé.
   *
   * Deux natures, deux apparences : le nombre de fiches informe, tandis que
   * les fils de discussion ouverts appellent une réponse — d'où la pastille
   * pleine pour les seconds. Afficher les commentaires sous le mot « Notes »,
   * ce qu'on faisait, ne disait rien de juste.
   */
  const compteurDeLaColonne = sideTab === "notes"
    ? nombreDeNotes > 0 && <span className={WIKI_SUBHEADER_COUNT}>{nombreDeNotes}</span>
    : openAnnotationCount > 0 && (
      <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
        {openAnnotationCount}
      </span>
    );

  const bandeauCentral = (
    <div className={WIKI_SUBHEADER}>
      {/* Même place pour le même besoin — atteindre les pages : un tiroir en
          dessous de `lg`, le dépliage de la colonne au-dessus. */}
      <button
        type="button"
        onClick={onOpenTree}
        aria-label={t("openPages")}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
      >
        <PanelLeft className="h-3.5 w-3.5" /> {t("pagesLabel")}
        {compteurDesPages}
      </button>
      {navCollapsed && (
        <button
          type="button"
          onClick={onExpandNav}
          aria-label={t("expandPages")}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground hidden lg:flex"
        >
          <PanelLeft className="h-3.5 w-3.5" /> {t("pagesLabel")}
          {compteurDesPages}
        </button>
      )}
      {/* Le segment central ne porte plus que la ceinture d'outils : le fil
          d'Ariane est monté dans l'en-tête principal, où il ne dispute plus
          la place aux outils. Vide en lecture, le segment reste là — c'est lui
          qui aligne le trait avec les deux colonnes voisines. */}
      <div className="min-w-0 flex-1">
        {editing && <WikiFormatToolbar onFormat={appliquerMiseEnForme} />}
      </div>
      {/* Symétrique du bouton des pages : le tiroir en dessous de `xl`, le
          dépliage de la colonne au-dessus. */}
      <button
        type="button"
        onClick={() => setSideDrawerOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground xl:hidden"
      >
        <PanelRight className="h-3.5 w-3.5" />
        {sideTab === "notes" ? tNotes("title") : t("annotations.title")}
        {compteurDeLaColonne}
      </button>
      {sideCollapsed && (
        <button
          type="button"
          onClick={() => replierPanneau(false)}
          aria-label={t("openPanel")}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground hidden xl:flex"
        >
          <PanelRight className="h-3.5 w-3.5" />
          {sideTab === "notes" ? tNotes("title") : t("annotations.title")}
          {compteurDeLaColonne}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {bandeauCentral}

        {/* Le panneau latéral vit HORS de cette bascule : le mode
            modification, seul à rendre les notes modifiables, masquait
            sinon la colonne où on les modifie. */}
        {editing ? (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-6">
            <div className="flex items-center gap-3">
              {champTitre}
              {draftBadge}
              {restrictedBadge}
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

            {loadingDraft ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className={cn("min-h-0 flex-1", showPreview ? "flex gap-4" : "flex flex-col")}>
                {/* Le markdown se saisit tel quel, coloré : un article de wiki
                    s'écrit avec des titres, des liens internes et des tableaux
                    qu'un champ de texte enrichi ne sait pas montrer sans les
                    trahir. L'aperçu, à côté, dit le résultat. */}
                <CodeEditor
                  fill
                  language="markdown"
                  value={draft}
                  onChange={handleDraftChange}
                  textareaRef={champMarkdown}
                  onKeyDown={surToucheDuChamp}
                  placeholder={t("contentPlaceholder")}
                  ariaLabel={t("contentLabel")}
                  // Sans cadre : le champ est la colonne de texte, pas un
                  // encadré posé dedans. Le halo de focus du `<textarea>`
                  // reste la seule marque, et suffit.
                  className="flex-1 rounded-none border-0"
                />
                {showPreview && (
                  <div className="flex-1 overflow-y-auto rounded-2xl border border-border-soft p-4">
                    {draft.trim()
                      ? (
                        <MarkdownRenderer
                          content={resolveWikiLinks(draft, pages)}
                          allowImages
                          onWikiLink={onNavigate}
                          className={WIKI_PROSE_HEADING_CLASSES}
                          lexiconTerms={lexiconTerms}
                        />
                      )
                      : <p className="text-sm italic text-muted-foreground">{t("nothingToPreview")}</p>
                    }
                  </div>
                )}
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {lastAutosavedAt && t("draftSavedAt", {
                  time: lastAutosavedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
                  <History className="mr-1 h-3.5 w-3.5" /> {t("versionHistory")}
                </Button>
                <Button variant="ghost" size="sm" onClick={quitterLaModification} disabled={publishing}>
                  {tCommon("cancel")}
                </Button>
                <Button size="sm" onClick={() => void publish()} disabled={publishing || loadingDraft}>
                  {publishing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {t("publish")}
                </Button>
              </div>
            </div>

            <WikiVersionHistoryPanel
              open={historyOpen}
              onOpenChange={setHistoryOpen}
              pageId={page.id}
              supabase={supabase}
              onRestored={patch => {
                setDraft(patch.content);
                onPageUpdated({ id: page.id, ...patch });
              }}
            />
            </div>
        ) : (
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <div className="mx-auto flex max-w-4xl gap-8">
              <div className="min-w-0 max-w-2xl flex-1">
                {/* `pr-11` comme le corps de l'article : la marge des commandes
                de commentaire, pour que les deux bords droits coïncident. */}
            <div className="mb-6 flex items-start justify-between gap-4 pr-11">
                  <h1 className="flex flex-1 items-center gap-2 text-2xl font-semibold">
                    {pageIcon}
                    {page.title}
                  </h1>
                  <div className="flex shrink-0 items-center gap-2">
                    {draftBadge}
                    {restrictedBadge}
                  </div>
                </div>
                {page.content?.trim() ? (
                  <WikiAnnotationLayer
                    contentKey={contentKey}
                    threads={annotations.threads}
                    active={activeAnnotation}
                    draftAnchor={annotationDraft?.anchor ?? null}
                    canComment={canAnnotate}
                    onActivate={id => { if (id) openAnnotation(id, false); }}
                    onDraft={startDraft}
                    onDetachedChange={onDetachedChange}
                  >
                    <MarkdownRenderer
                      content={resolvedContent}
                      allowImages
                      onWikiLink={onNavigate}
                      className={WIKI_PROSE_HEADING_CLASSES}
                      lexiconTerms={lexiconTerms}
                    />
                  </WikiAnnotationLayer>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isEditMode ? t("pageEmptyEdit") : t("pageEmpty")}
                  </p>
                )}
              </div>
              <WikiTableOfContents headings={headings} />
            </div>
          </div>
        )}
      </div>

      {/* En colonne à partir de `xl` ; en dessous, la même chose en tiroir —
          à 1280 px la colonne ne laissait que 464 px au texte, à 375 px elle
          était posée hors de l'écran, inatteignable. */}
      {colonneLaterale && !sideCollapsed && (
        <WikiSidePanel
          tab={sideTab}
          onTabChange={setSideTab}
          openCommentCount={openAnnotationCount}
          width={panelWidth}
          handleProps={isEditMode ? panelHandleProps : undefined}
          onCollapse={() => replierPanneau(true)}
        >
          {sideTab === "comments" ? (
            <WikiAnnotationsPanel
              threads={annotations.threads}
              detachedIds={detachedIds}
              loading={annotations.loading}
              pending={annotations.pending}
              activeId={activeAnnotation?.id ?? null}
              draft={annotationDraft}
              currentUserId={userId}
              canModerate={canEdit}
              onActivate={id => openAnnotation(id, true)}
              onCreate={body => void createFromDraft(body)}
              onCancelDraft={() => setAnnotationDraft(null)}
              onReply={(root: WikiAnnotation, body: string) => annotations.reply(root, body)}
              onSetResolved={(root, resolved) => void annotations.setResolved(root, resolved)}
              onDelete={annotation => void annotations.remove(annotation)}
            />
          ) : (
            <WikiNotesPanel pageId={page.id} isEditMode={isEditMode} notes={notes} />
          )}
        </WikiSidePanel>
      )}

      <Drawer open={sideDrawerOpen && !colonneLaterale} onOpenChange={setSideDrawerOpen} swipeDirection="right">
        <SideSheetContent width="wide" hideClose>
          <WikiSidePanel
            tab={sideTab}
            onTabChange={setSideTab}
            openCommentCount={openAnnotationCount}
            width="100%"
          >
            {sideTab === "comments" ? (
              <WikiAnnotationsPanel
                threads={annotations.threads}
                detachedIds={detachedIds}
                loading={annotations.loading}
                pending={annotations.pending}
                activeId={activeAnnotation?.id ?? null}
                draft={annotationDraft}
                currentUserId={userId}
                canModerate={canEdit}
                onActivate={id => openAnnotation(id, true)}
                onCreate={body => void createFromDraft(body)}
                onCancelDraft={() => setAnnotationDraft(null)}
                onReply={(root: WikiAnnotation, body: string) => annotations.reply(root, body)}
                onSetResolved={(root, resolved) => void annotations.setResolved(root, resolved)}
                onDelete={annotation => void annotations.remove(annotation)}
              />
            ) : (
              <WikiNotesPanel pageId={page.id} isEditMode={isEditMode} notes={notes} />
            )}
          </WikiSidePanel>
        </SideSheetContent>
      </Drawer>
    </div>
  );
}
