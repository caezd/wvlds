"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MessageSquarePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { MEDIA, useMediaQuery } from "@/hooks/useMediaQuery";
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

  /**
   * Commandes de marge, une par bloc : commenter, et le compte de ses fils.
   *
   * Permanentes, et non dévoilées au survol — ce geste n'existe pas au doigt,
   * et ce qui ne s'y montre pas y est introuvable. Une règle unique pour tous
   * les pointeurs vaut mieux que deux comportements à tenir.
   */
  const [commandes, setCommandes] = React.useState<
    { index: number; top: number; ids: string[]; resolus: boolean }[]
  >([]);
  const signatureCommandes = React.useRef<string | null>(null);

  /**
   * Bloc sous le pointeur, dont le bouton se montre.
   *
   * Au doigt il n'y a pas de survol : les boutons y sont tous visibles, faute
   * de quoi ils seraient introuvables.
   */
  const sansSurvol = useMediaQuery(MEDIA.pointeurGrossier);
  const [survol, setSurvol] = React.useState<number | null>(null);

  // Les positions sont mesurées : un changement de largeur les déplace sans
  // qu'aucun rendu ne le signale.
  const [, setMesure] = React.useState(0);
  React.useEffect(() => {
    const relever = () => setMesure(n => n + 1);
    window.addEventListener("resize", relever);
    window.addEventListener("orientationchange", relever);
    return () => {
      window.removeEventListener("resize", relever);
      window.removeEventListener("orientationchange", relever);
    };
  }, []);

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
  // rendu, y compris celles que rien dans nos données n'annonce. Les deux
  // écritures d'état qu'il contient sont gardées par une empreinte — sans
  // changement réel, rien n'est écrit, donc aucune boucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Une commande par bloc, alignée sur sa première ligne. Un lecteur sans
    // droit d'écriture ne voit que celles qui portent une discussion.
    const cadre = wrapperRef.current;
    const suivantes = cadre
      ? blocs
        .map((b, index) => ({
          index,
          top: b.el.getBoundingClientRect().top - cadre.getBoundingClientRect().top,
          ids: (b.el.dataset.annotationIds ?? "").split(" ").filter(Boolean),
          resolus: b.el.dataset.annotationResolved === "true",
        }))
        .filter(c => canComment || c.ids.length > 0)
      : [];

    // Même précaution : sans comparaison, chaque mesure relancerait un rendu.
    const empreinte = suivantes
      .map(c => `${c.index}:${Math.round(c.top)}:${c.ids.join(",")}:${c.resolus}`)
      .join("|");
    if (empreinte !== signatureCommandes.current) {
      signatureCommandes.current = empreinte;
      setCommandes(suivantes);
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

  function commenterLeBloc(index: number) {
    const root = contentRef.current;
    if (!root) return;
    const anchor = buildBlockAnchor(collectBlocks(root), index);
    if (anchor) onDraft(anchor);
  }

  function surClic(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null;
    const bloc = target?.closest<HTMLElement>("[data-annotation-id]");
    const id = bloc?.dataset.annotationId;
    if (id) onActivate(id);
  }

  return (
    // `pr-11` réserve la marge droite : les commandes y vivent, et restent
    // ainsi DANS la boîte de l'enveloppe. Posées en dehors, aller les cliquer
    // en faisait sortir le pointeur, ce qui déclenchait le `mouseleave`
    // ci-dessous et les démontait avant que le clic n'aboutisse.
    <div
      ref={wrapperRef}
      className={cn("relative pr-11", className)}
      onMouseLeave={() => setSurvol(null)}
    >
      <div
        ref={contentRef}
        key={contentKey}
        onMouseOver={e => {
          if (sansSurvol) return;
          const blocs = collectBlocks(e.currentTarget);
          const index = blockIndexOfNode(blocs, e.target as Node);
          setSurvol(index === -1 ? null : index);
        }}
        onClick={surClic}
      >
        {children}
      </div>

      {/* À droite du bloc, le bouton puis le compte. Le bouton garde sa place
          même effacé : sinon la pastille se déplacerait au gré du survol. */}
      {commandes.map(commande => (
        <div
          key={commande.index}
          // `pt-1` : le haut d'un bloc n'est pas le haut de sa première ligne,
          // que l'interligne décale vers le bas. Les commandes se posent donc
          // un cran plus bas pour tomber en face du texte.
          className="group absolute right-0 flex items-center gap-1 pt-1"
          style={{ top: commande.top }}
        >
          {canComment && (
            <button
              type="button"
              onClick={() => commenterLeBloc(commande.index)}
              aria-label={t("addComment")}
              title={t("addComment")}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground",
                // Il se montre aussi quand on le vise lui-même : effacé mais
                // cliquable, il se laissait atteindre à l'aveugle. Le survol
                // du bloc ne dit rien de celui de la marge, qui n'en fait
                // pas partie.
                "focus-visible:opacity-100 group-hover:opacity-100",
                sansSurvol || survol === commande.index ? "opacity-100" : "opacity-0",
              )}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          )}
          {commande.ids.length > 0 && (
            <button
              type="button"
              onClick={() => onActivate(commande.ids[0])}
              aria-label={t("title")}
              title={t("title")}
              className={cn(
                "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-medium",
                // Un fil résolu garde sa pastille — savoir qu'une discussion a
                // eu lieu ici a de la valeur — mais cesse d'appeler l'œil.
                commande.resolus
                  ? "bg-secondary text-muted-foreground"
                  : "bg-accent text-accent-foreground",
                active && commande.ids.includes(active.id) && "ring-2 ring-accent/40",
              )}
            >
              {commande.ids.length}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
