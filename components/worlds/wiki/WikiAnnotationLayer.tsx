"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MessageSquarePlus, StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getPlainText,
  offsetsFromRange,
  slicesForOffsets,
  wrapSlices,
} from "@/lib/domTextOffsets";
import {
  buildAnchor,
  resolveAnchor,
  type TextAnchor,
} from "@/lib/wikiAnnotations";
import type { WikiAnnotationKind, WikiAnnotationThread } from "@/types/worlds";

/** Annotation mise en avant, et faut-il l'amener à l'écran. */
export type ActiveAnnotation = { id: string; scrollIntoView: boolean };

/**
 * Surligne les passages annotés du texte rendu, et propose d'en annoter un
 * nouveau à la sélection.
 *
 * ── Pourquoi manipuler le DOM plutôt que rendre des `<mark>` ──
 * Une annotation ne connaît que des offsets de caractères ; ses bornes tombent
 * donc n'importe où, y compris au milieu d'un `<strong>` ou à cheval sur deux
 * éléments. Les exprimer en JSX supposerait de reconstruire l'arbre markdown
 * autour d'elles — soit réécrire MarkdownRenderer, avec les liens du wiki, les
 * termes du lexique et les blocs de code à retraverser.
 *
 * On laisse donc React rendre le markdown comme d'habitude, puis on enveloppe
 * après coup les portions concernées. Deux conditions rendent la chose sûre :
 *
 *  1. l'arbre est **remonté** (`key`) dès que son texte ou l'ensemble des
 *     annotations change, jamais mis à jour en place — React ne cherche donc
 *     jamais à retirer un nœud texte qu'on a déplacé dans un `<span>` ;
 *  2. l'enveloppement n'ajoute ni ne retire aucun texte, seulement des
 *     éléments : les offsets restent justes d'une annotation à la suivante,
 *     y compris quand deux passages annotés se chevauchent.
 */
export function WikiAnnotationLayer({
  children,
  contentKey,
  threads,
  active,
  draftAnchor,
  canComment,
  canTakeNotes,
  onActivate,
  onDraft,
  onDetachedChange,
  className,
}: {
  /** Le rendu markdown de la page. */
  children: React.ReactNode;
  /** Change quand le texte de la page change — force le remontage. */
  contentKey: string;
  threads: WikiAnnotationThread[];
  active: ActiveAnnotation | null;
  /** Sélection en cours d'annotation, surlignée en attendant la validation. */
  draftAnchor: TextAnchor | null;
  canComment: boolean;
  canTakeNotes: boolean;
  onActivate: (id: string | null) => void;
  onDraft: (anchor: TextAnchor, kind: WikiAnnotationKind) => void;
  /** Annotations dont l'extrait a disparu du texte — affichées à part. */
  onDetachedChange?: (detachedIds: string[]) => void;
  className?: string;
}) {
  const t = useTranslations("wiki.annotations");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const [toolbar, setToolbar] = React.useState<
    { anchor: TextAnchor; top: number; left: number } | null
  >(null);

  // Gardée dans une ref : la signaler ne doit pas faire partie des
  // dépendances de l'effet de surlignage, qui se relancerait en boucle.
  const onDetachedChangeRef = React.useRef(onDetachedChange);
  onDetachedChangeRef.current = onDetachedChange;

  const anchoredThreads = React.useMemo(
    () => threads.filter(th => th.root.anchor_quote !== null),
    [threads],
  );

  // Signature de l'ensemble annoté : deux rendus qui la partagent produisent
  // exactement les mêmes surlignages, et n'ont donc pas à être remontés.
  const anchorsKey = React.useMemo(
    () => anchoredThreads
      .map(th => `${th.root.id}:${th.root.resolved_at ? "r" : "o"}:${th.root.kind}`)
      .join("|"),
    [anchoredThreads],
  );
  const draftKey = draftAnchor ? `${draftAnchor.start}:${draftAnchor.quote.length}` : "";

  // L'effet de surlignage doit s'exécuter une fois par arbre monté, et une
  // seule : relancé sur un DOM déjà enveloppé, il poserait une seconde série
  // de span par-dessus la première. Ses dépendances sont donc exactement les
  // trois chaînes qui composent la `key` du conteneur — l'effet se relance si
  // et seulement si React vient de reconstruire le rendu. Les données, elles,
  // sont lues à travers une ref plutôt que déclarées en dépendance : leur
  // identité change à chaque rendu du parent, la `key` non.
  const latest = React.useRef({ anchoredThreads, draftAnchor });
  latest.current = { anchoredThreads, draftAnchor };

  React.useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const { anchoredThreads, draftAnchor } = latest.current;

    const text = getPlainText(root);

    // Toutes les résolutions AVANT le moindre enveloppement : elles portent
    // sur le même texte, que l'enveloppement ne modifie pas, mais les calculer
    // d'un bloc rend cette indépendance évidente.
    const detached: string[] = [];
    const resolved = anchoredThreads.flatMap(th => {
      const range = resolveAnchor(text, {
        quote: th.root.anchor_quote ?? "",
        prefix: th.root.anchor_prefix ?? "",
        suffix: th.root.anchor_suffix ?? "",
        start: th.root.anchor_start ?? 0,
      });
      if (!range) { detached.push(th.root.id); return []; }
      return [{ thread: th, range }];
    });

    for (const { thread, range } of resolved) {
      wrapSlices(slicesForOffsets(root, range.start, range.end), span => {
        span.dataset.annotationId = thread.root.id;
        span.dataset.annotationKind = thread.root.kind;
        if (thread.root.resolved_at) span.dataset.annotationResolved = "true";
        span.className = "wiki-annotation";
      });
    }

    if (draftAnchor) {
      const range = resolveAnchor(text, draftAnchor);
      if (range) {
        wrapSlices(slicesForOffsets(root, range.start, range.end), span => {
          span.dataset.annotationDraft = "true";
          span.className = "wiki-annotation";
        });
      }
    }

    onDetachedChangeRef.current?.(detached);
  }, [contentKey, anchorsKey, draftKey]);

  // Mise en avant de l'annotation courante : un attribut posé sur les span
  // déjà en place, pour ne pas remonter tout le rendu à chaque clic.
  React.useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    for (const el of root.querySelectorAll<HTMLElement>("[data-annotation-id]")) {
      const isActive = active !== null && el.dataset.annotationId === active.id;
      if (isActive) el.dataset.annotationActive = "true";
      else delete el.dataset.annotationActive;
    }

    if (active?.scrollIntoView) {
      // `CSS.escape` manque encore à quelques environnements de test ; les ids
      // sont des UUID, un repli sans échappement ne risque rien.
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(active.id)
        : active.id;
      root
        .querySelector(`[data-annotation-id="${escaped}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [active, contentKey, anchorsKey]);

  // La barre suit la sélection : dès que celle-ci retombe — un clic ailleurs
  // dans la page, dans le panneau, n'importe où — elle disparaît. Sans cela
  // elle resterait affichée au-dessus d'un passage qui n'est plus sélectionné.
  React.useEffect(() => {
    if (!toolbar) return;
    const onSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) setToolbar(null);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [toolbar]);

  /** Lit la sélection courante et propose la barre d'annotation. */
  function handleSelection() {
    const root = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!root || !wrapper) return;
    if (!canComment && !canTakeNotes) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setToolbar(null);
      return;
    }

    const range = selection.getRangeAt(0);
    // Sélection commencée ou terminée hors du texte de la page (panneau,
    // fil d'Ariane…) : rien à ancrer.
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setToolbar(null);
      return;
    }

    const text = getPlainText(root);
    const offsets = offsetsFromRange(root, range);
    if (!offsets) { setToolbar(null); return; }

    const anchor = buildAnchor(text, offsets.start, offsets.end);
    if (!anchor) { setToolbar(null); return; }

    // La barre se place sur la sélection ; sans mise en page mesurable (un
    // environnement de test, une plage réduite à rien), elle se contente du
    // coin haut-gauche du texte plutôt que de faire échouer la sélection.
    const rect = typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : null;
    const box = wrapper.getBoundingClientRect();
    setToolbar({
      anchor,
      top: rect ? rect.top - box.top : 0,
      left: rect ? rect.left - box.left + rect.width / 2 : 0,
    });
  }

  function startDraft(kind: WikiAnnotationKind) {
    if (!toolbar) return;
    onDraft(toolbar.anchor, kind);
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null;
    const span = target?.closest<HTMLElement>("[data-annotation-id]");
    if (!span) return;
    const id = span.dataset.annotationId;
    if (id) onActivate(id);
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div
        ref={contentRef}
        key={`${contentKey}|${anchorsKey}|${draftKey}`}
        onMouseUp={handleSelection}
        onKeyUp={handleSelection}
        onClick={handleClick}
      >
        {children}
      </div>

      {toolbar && (
        <div
          className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full border border-border-soft bg-popover p-1 shadow-md"
          style={{ top: toolbar.top - 8, left: toolbar.left }}
          // La barre naît d'une sélection : lui laisser le focus l'effacerait
          // avant même que le clic n'aboutisse.
          onMouseDown={e => e.preventDefault()}
        >
          {canComment && (
            <button
              type="button"
              onClick={() => startDraft("comment")}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> {t("addComment")}
            </button>
          )}
          {canTakeNotes && (
            <button
              type="button"
              onClick={() => startDraft("note")}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <StickyNote className="h-3.5 w-3.5" /> {t("addNote")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
