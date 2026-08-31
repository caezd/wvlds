"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, History, Loader2, Lock, Pencil } from "lucide-react";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { createClient } from "@/lib/supabase/client";
import { resolveWikiLinks } from "@/lib/wikiLinks";
import { extractHeadings } from "@/lib/wikiToc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWikiAnnotations } from "@/hooks/useWikiAnnotations";
import type { TextAnchor } from "@/lib/wikiAnnotations";
import type { WikiAnnotation } from "@/types/worlds";
import { WikiAnnotationLayer, type ActiveAnnotation } from "./WikiAnnotationLayer";
import { WikiAnnotationsPanel, type AnnotationDraft } from "./WikiAnnotationsPanel";
import { WikiNotesPanel } from "./WikiNotesPanel";
import { WikiSidePanel, type WikiSideTab } from "./WikiSidePanel";
import { WikiBreadcrumb } from "./WikiBreadcrumb";
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
  pages,
  ancestors,
  canEdit,
  isEditMode,
  supabase,
  onPageUpdated,
  onNavigate,
  onExpandFolder,
  autoEdit = false,
  onAutoEditConsumed,
  lexiconTerms,
}: {
  page: WikiPage;
  /** Monde de la page — dénormalisé sur les annotations (voir migration 137). */
  worldId: string;
  /** Toutes les pages du wiki — pour résoudre les liens internes `[[Titre]]`. */
  pages: WikiPage[];
  /** Dossiers ancêtres de la page, du plus ancien au plus proche (fil d'Ariane). */
  ancestors: WikiPage[];
  /** Permission de l'utilisateur (owner/admin/editor) — indépendante du bascule de mode édition. */
  canEdit: boolean;
  /** Mode édition actif dans le panneau (bascule + permission). */
  isEditMode: boolean;
  supabase: ReturnType<typeof createClient>;
  onPageUpdated: (patch: Partial<WikiPage> & { id: string }) => void;
  /** Navigue vers la page dont le slug est résolu depuis un lien interne. */
  onNavigate: (slug: string) => void;
  /** Déplie un dossier ancêtre (et les siens) dans la sidebar, depuis le fil d'Ariane. */
  onExpandFolder: (folderId: string) => void;
  /** Entre automatiquement en édition au montage (page tout juste créée depuis un modèle). */
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
  /** Lexique du monde — surligné automatiquement dans le contenu rendu. */
  lexiconTerms?: WorldLexiconTerm[];
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");

  const [editing, setEditing] = React.useState(false);
  const [loadingDraft, setLoadingDraft] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [showPreview, setShowPreview] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = React.useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // ── Annotations ───────────────────────────────────────────
  const { userId } = useCurrentUser();
  // Une seule colonne latérale, permanente, dont l'onglet dit ce qu'elle montre.
  const [sideTab, setSideTab] = React.useState<WikiSideTab>("comments");
  const [activeAnnotation, setActiveAnnotation] = React.useState<ActiveAnnotation | null>(null);
  const [annotationDraft, setAnnotationDraft] = React.useState<AnnotationDraft | null>(null);
  const [detachedIds, setDetachedIds] = React.useState<Set<string>>(() => new Set());

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
    setActiveAnnotation({ id, scrollIntoView });
  }

  function startDraft(anchor: TextAnchor) {
    setSideTab("comments");
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
    if (!isEditMode) {
      setEditing(false);
      setShowPreview(false);
    }
  }, [isEditMode]);

  // Page tout juste créée depuis un modèle : entre directement en édition.
  React.useEffect(() => {
    if (autoEdit && isEditMode) {
      void startEditing();
      onAutoEditConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function handleDraftChange(v: string) {
    setDraft(v);
    dirtyRef.current = true;
    if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = setTimeout(() => void flushDraft(v), WIKI_AUTOSAVE_DELAY);
  }

  async function startEditing() {
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
    setEditing(false);
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

  if (editing) {
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-6">
        <WikiBreadcrumb ancestors={ancestors} onExpandFolder={onExpandFolder} />
        <div className="flex items-center gap-3">
          <h1 className="flex flex-1 items-center gap-2 truncate text-2xl font-semibold">
            {pageIcon}
            {page.title}
          </h1>
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
            <div className={cn(
              "rounded-2xl border border-border-soft p-4",
              "flex flex-1 flex-col overflow-hidden",
            )}>
              <ParagraphBlockEditor
                value={draft}
                onChange={handleDraftChange}
                placeholder={t("contentPlaceholder")}
                submitOnEnter={false}
                formatting
                wrapperClassName="max-h-none flex-1 overflow-y-auto"
                className="text-sm"
              />
            </div>
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
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={publishing}>
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
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl gap-8">
          <div className="min-w-0 max-w-2xl flex-1">
            <WikiBreadcrumb ancestors={ancestors} onExpandFolder={onExpandFolder} />
            <div className="mb-6 flex items-start justify-between gap-4">
              <h1 className="flex flex-1 items-center gap-2 text-2xl font-semibold">
                {pageIcon}
                {page.title}
              </h1>
              <div className="flex shrink-0 items-center gap-2">
                {draftBadge}
                {restrictedBadge}
                {isEditMode && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void startEditing()}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {tCommon("edit")}
                  </Button>
                )}
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

      <WikiSidePanel
        tab={sideTab}
        onTabChange={setSideTab}
        openCommentCount={openAnnotationCount}
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
            <WikiNotesPanel
              pageId={page.id}
              worldId={worldId}
              isEditMode={isEditMode}
              supabase={supabase}
            />
          )}
      </WikiSidePanel>
    </div>
  );
}
