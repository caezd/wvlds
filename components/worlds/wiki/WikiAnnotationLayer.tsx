"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MessageSquarePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { blockIndexOfNode, collectBlocks } from "@/lib/domBlocks";
import { getPlainText, slicesForOffsets } from "@/lib/domTextOffsets";
import { resolveAnchor } from "@/lib/wikiAnnotations";
import {
  buildBlockAnchor,
  resolveBlockAnchor,
  type BlockAnchor,
} from "@/lib/wikiBlockAnchors";
import type { WikiAnnotationThread } from "@/types/worlds";

/** Annotation mise en avant, et faut-il l'amener à l'écran. */
export type ActiveAnnotation = { id: string; scrollIntoView: boolean };

/**
 * Marque les blocs commentés du texte rendu, et propose d'en commenter un
 * nouveau au survol.
 *
 * ── Pourquoi le bloc, et non la sélection ──
 * Une ancre de caractères se perd dès que le texte bouge autour d'elle. Un
 * bloc — paragraphe, élément de liste, citation, titre — a une identité que ni
 * l'insertion ni le déplacement d'un autre bloc ne touche : aucun des deux ne
 * change son texte. Voir `lib/wikiBlockAnchors.ts` pour le raisonnement
 * complet, et pourquoi l'identité n'est pas écrite dans le markdown.
 *
 * ── Pourquoi manipuler le DOM plutôt que rendre des marques ──
 * Le découpage en blocs se lit sur le rendu, qui n'existe qu'une fois React
 * passé. On le laisse donc rendre le markdown comme d'habitude, puis on pose
 * des attributs sur les éléments concernés.
 *
 * Le marquage se refait à **chaque commit**, et commence par tout effacer.
 * Une version antérieure ne le rejouait qu'au remontage de l'arbre, sur une
 * `key` censée changer avec le texte : l'invariant était faux. React met le
 * rendu à jour EN PLACE dès que ses données bougent pour une autre raison —
 * lexique chargé après coup, liste des pages rafraîchie, mise à jour temps
 * réel — et remplace alors des nœuds sans que la `key` bouge. Les marques
 * disparaissaient, sans rien pour les reposer.
 *
 * Rejouer est sûr parce qu'on ne pose que des attributs : l'opération est
 * idempotente. Elle ne l'était pas du temps où l'on enveloppait le texte dans
 * des `<span>`, d'où la précaution d'alors.
 *
 * ── Les commentaires d'avant ──
 * Ceux écrits du temps de la sélection n'ont pas de type de bloc : on les
 * résout comme avant, puis on remonte au bloc qui les contient. Ils
 * s'affichent donc comme les autres, sans qu'aucune donnée n'ait été
 * convertie.
 */
export function WikiAnnotationLayer({
  children,
  contentKey,
  threads,
  active,
  draftAnchor,
  canComment,
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
  /** Bloc en cours de commentaire, marqué en attendant la validation. */
  draftAnchor: BlockAnchor | null;
  canComment: boolean;
  onActivate: (id: string | null) => void;
  onDraft: (anchor: BlockAnchor) => void;
  /** Commentaires dont le bloc a disparu du texte — affichés à part. */
  onDetachedChange?: (detachedIds: string[]) => void;
  className?: string;
}) {
  const t = useTranslations("wiki.annotations");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  /** Bloc survolé : son index, et où poser le bouton en regard. */
  const [survol, setSurvol] = React.useState<{ index: number; top: number } | null>(null);

  // Gardée dans une ref : la signaler ne doit pas faire partie des
  // dépendances de l'effet de marquage, qui se relancerait en boucle.
  const onDetachedChangeRef = React.useRef(onDetachedChange);
  onDetachedChangeRef.current = onDetachedChange;

  const anchoredThreads = React.useMemo(
    () => threads.filter(th => th.root.anchor_quote !== null),
    [threads],
  );

  /** Dernier ensemble détaché signalé — pour ne le redire qu'au changement. */
  const detachesSignales = React.useRef<string | null>(null);

  // Sans tableau de dépendances : le marquage suit chaque mise à jour du
  // rendu, y compris celles que rien dans nos données n'annonce.
  React.useLayoutEffect(() => {
    const racine = contentRef.current;
    if (!racine) return;

    // Table rase d'abord : un bloc dont le fil vient d'être supprimé garde
    // sinon sa marque, React ayant pu conserver le même nœud.
    for (const el of racine.querySelectorAll<HTMLElement>("[data-annotation-ids], [data-annotation-draft]")) {
      delete el.dataset.annotationIds;
      delete el.dataset.annotationId;
      delete el.dataset.annotationResolved;
      delete el.dataset.annotationActive;
      delete el.dataset.annotationDraft;
    }

    const blocs = collectBlocks(racine);

    // Fonction fléchée et non déclaration : TypeScript ne garde le
    // rétrécissement de `racine` que dans une fermeture créée après la garde.
    /** Bloc visé par un fil, quelle que soit la génération de son ancre. */
    const indexDuFil = (th: WikiAnnotationThread): number | null => {
      const { anchor_block_type, anchor_quote, anchor_prefix, anchor_suffix, anchor_start } = th.root;

      if (anchor_block_type) {
        return resolveBlockAnchor(blocs, {
          type: anchor_block_type,
          quote: anchor_quote ?? "",
          prefix: anchor_prefix ?? "",
          suffix: anchor_suffix ?? "",
          index: anchor_start ?? 0,
        });
      }

      // Ancre de sélection : on la résout comme avant, puis on remonte au bloc
      // qui la contient.
      const range = resolveAnchor(getPlainText(racine), {
        quote: anchor_quote ?? "",
        prefix: anchor_prefix ?? "",
        suffix: anchor_suffix ?? "",
        start: anchor_start ?? 0,
      });
      if (!range) return null;
      const premier = slicesForOffsets(racine, range.start, range.end)[0];
      if (!premier) return null;
      const index = blockIndexOfNode(blocs, premier.node);
      return index === -1 ? null : index;
    };

    // Un bloc peut porter plusieurs fils : on les rassemble avant de marquer,
    // pour que son état — résolu ou non — tienne compte de tous.
    const parBloc = new Map<number, WikiAnnotationThread[]>();
    const detached: string[] = [];

    for (const th of anchoredThreads) {
      const index = indexDuFil(th);
      if (index === null) { detached.push(th.root.id); continue; }
      const liste = parBloc.get(index);
      if (liste) liste.push(th);
      else parBloc.set(index, [th]);
    }

    for (const [index, fils] of parBloc) {
      // Des attributs, et rien qu'eux : le point de marge se lit en CSS
      // depuis `data-annotation-ids`. Une classe ajoutée à la main serait à la
      // merci du prochain `className` que React réécrirait sur ce nœud.
      const el = blocs[index].el;
      el.dataset.annotationIds = fils.map(th => th.root.id).join(" ");
      // Le fil ouvert le plus ancien avant les autres : c'est celui qu'un clic
      // ouvre, et celui qui attend une réponse.
      const premierOuvert = fils.find(th => !th.root.resolved_at) ?? fils[0];
      el.dataset.annotationId = premierOuvert.root.id;
      if (fils.every(th => th.root.resolved_at)) el.dataset.annotationResolved = "true";
      // Posée ici et non dans un effet à part : celui-ci vient de l'effacer,
      // et lui ne se rejoue pas à chaque commit.
      if (active && fils.some(th => th.root.id === active.id)) {
        el.dataset.annotationActive = "true";
      }
    }

    if (draftAnchor) {
      const index = resolveBlockAnchor(blocs, draftAnchor);
      if (index !== null) blocs[index].el.dataset.annotationDraft = "true";
    }

    // L'effet se rejouant à chaque commit, redire un ensemble inchangé
    // relancerait le parent, donc un commit, donc cet effet : sans fin.
    const signature = detached.join("|");
    if (signature !== detachesSignales.current) {
      detachesSignales.current = signature;
      onDetachedChangeRef.current?.(detached);
    }
  });

  // Amener le fil courant à l'écran — à son changement, pas à chaque commit.
  React.useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    if (active?.scrollIntoView) {
      root
        .querySelector(`[data-annotation-ids~="${active.id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [active]);

  /** Suit le bloc sous le pointeur pour lui présenter le bouton. */
  function surSurvol(e: React.MouseEvent<HTMLDivElement>) {
    if (!canComment) return;
    const root = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!root || !wrapper) return;

    const blocs = collectBlocks(root);
    const index = blockIndexOfNode(blocs, e.target as Node);
    if (index === -1) { setSurvol(null); return; }

    // Sans mise en page mesurable — un environnement de test — le bouton se
    // pose en haut du texte plutôt que de ne pas se poser du tout.
    const el = blocs[index].el;
    const top = typeof el.getBoundingClientRect === "function"
      ? el.getBoundingClientRect().top - wrapper.getBoundingClientRect().top
      : 0;
    setSurvol({ index, top });
  }

  function commenterLeBloc() {
    const root = contentRef.current;
    if (!root || !survol) return;
    const anchor = buildBlockAnchor(collectBlocks(root), survol.index);
    if (anchor) onDraft(anchor);
    setSurvol(null);
  }

  function surClic(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null;
    const bloc = target?.closest<HTMLElement>("[data-annotation-id]");
    const id = bloc?.dataset.annotationId;
    if (id) onActivate(id);
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative", className)}
      onMouseLeave={() => setSurvol(null)}
    >
      <div
        ref={contentRef}
        key={contentKey}
        onMouseOver={surSurvol}
        onClick={surClic}
      >
        {children}
      </div>

      {survol && (
        // Au bout de la ligne, à droite, et surtout DANS la boîte de
        // l'enveloppe : posé en dehors, aller le cliquer faisait sortir le
        // pointeur, déclenchait le `mouseleave` ci-dessus, et le bouton
        // disparaissait avant que le clic n'aboutisse.
        <button
          type="button"
          onClick={commenterLeBloc}
          aria-label={t("addComment")}
          title={t("addComment")}
          className="absolute right-0 flex h-6 w-6 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm ring-1 ring-border-soft hover:bg-secondary hover:text-foreground"
          style={{ top: survol.top }}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
