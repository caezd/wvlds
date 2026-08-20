"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Code2, FileText, GripVertical, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { setWorldHomeGrid } from "@/app/actions/worldCatalog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ALL_WORLD_HOME_WIDGETS, type WorldHomeWidgetId } from "./worldHomeWidgets";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  compactHomeGridRows,
  DEFAULT_HOME_GRID_GAP,
  HOME_GRID_COLS,
  HOME_GRID_GAP_PRESETS,
  HOME_GRID_ROW_HEIGHT,
  MIN_BLOCK_W,
  moveBlock,
  resizeBlock,
  rowBoundaries,
  widgetOptionValue,
  WORLD_HOME_WIDGET_OPTIONS,
  type WorldHomeGridGap,
  type WorldHomeGridItem,
  type WorldHomeWidgetOption,
} from "./worldHomeGrid";
import { WorldHomeHtmlBlockEditor } from "./blocks/WorldHomeHtmlBlockEditor";
import { WorldHomeMarkdownBlockEditor } from "./blocks/WorldHomeMarkdownBlockEditor";

/**
 * Destination d'un déplacement en cours. `asNewRow` distingue les deux
 * intentions : rejoindre la ligne visée et s'y partager la largeur, ou
 * s'insérer seul sur une nouvelle ligne à cet endroit.
 */
type DropTarget = { row: number; col: number; asNewRow: boolean };

/**
 * Décalage visuel d'une frontière en cours de glissement, en pixels. Purement
 * d'affichage : le modèle (en colonnes entières) n'est mis à jour qu'au
 * relâchement, une fois le décalage converti en colonnes.
 */
type ResizePreview = { leftId: string; rightId: string; dx: number };

/** Part haute et basse d'une ligne visant l'espace ENTRE deux lignes plutôt
 *  que la ligne elle-même (un tiers de chaque côté). */
const NEW_ROW_BAND = 1 / 3;

/** Largeur minimale de la zone de saisie d'un diviseur, en pixels — bien
 *  au-delà de l'espacement "compact" (8px), trop fin pour viser au doigt.
 *  Toujours centrée sur la gouttière réelle, qui reste visuellement fine :
 *  seule la zone qui RÉAGIT au toucher/clic s'élargit. */
const MIN_DIVIDER_HIT_WIDTH = 24;

/**
 * Largeur de CONTENU du conteneur (hors `border` et `padding`).
 *
 * On soustrait explicitement bordures et paddings de la boîte englobante
 * plutôt que de lire `getComputedStyle(node).width` : sous
 * `box-sizing: border-box` — appliqué globalement par le preflight Tailwind —
 * cette propriété renvoie la largeur de la boîte de BORDURE, pas du contenu.
 * Ce calcul-ci est juste quel que soit le `box-sizing`, et garde la précision
 * sous-pixel (contrairement à `clientWidth`, arrondi à l'entier).
 */
/** Exporté uniquement pour être testable isolément — pas d'usage prévu hors ce fichier. */
export function getContentWidth(node: HTMLElement): number {
  const style = window.getComputedStyle(node);
  const px = (v: string) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const inset =
    px(style.borderLeftWidth) + px(style.borderRightWidth) + px(style.paddingLeft) + px(style.paddingRight);
  const border = node.getBoundingClientRect().width;
  if (border > 0) return Math.max(0, border - inset);
  // Repli (jsdom : pas de moteur de mise en page, rect toujours à 0).
  return Math.max(0, node.clientWidth - px(style.paddingLeft) - px(style.paddingRight));
}

/**
 * Largeur du conteneur, en pixels — sert uniquement à convertir un
 * déplacement de curseur en colonnes de grille pendant un geste. La
 * disposition, elle, ne dépend d'aucune mesure : c'est la grille CSS qui
 * place les blocs. Une mesure absente ou périmée ne peut donc plus décaler
 * l'affichage, seulement la sensibilité d'un glissement en cours.
 */
function useMeasuredWidth(): { containerRef: React.RefObject<HTMLDivElement | null>; width: number } {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setWidth(Math.round(getContentWidth(node)));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      // `entry.contentRect` exclut déjà `border`/`padding` — cohérent avec
      // `getContentWidth()` ci-dessus pour la mesure initiale.
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { containerRef, width };
}

/**
 * Réglages d'un widget — un champ numérique par option déclarée au registre
 * (voir WORLD_HOME_WIDGET_OPTIONS). Comme le sélecteur de couleur de
 * l'onglet Apparence, on ne persiste qu'à la fermeture du popover : taper
 * dans un champ nombre émet un `change` par frappe, ce qui enverrait sinon
 * une requête par caractère.
 */
function WidgetOptionsPopover({
  item,
  defs,
  onChange,
}: {
  item: WorldHomeGridItem;
  defs: WorldHomeWidgetOption[];
  onChange: (options: Record<string, number>) => void;
}) {
  const t = useTranslations("worlds");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, number>>({});

  const current = React.useMemo(
    () => Object.fromEntries(defs.map((d) => [d.key, widgetOptionValue(item.widgetId, d.key, item.options)])),
    [defs, item.widgetId, item.options],
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(current);
    } else if (defs.some((d) => draft[d.key] !== current[d.key])) {
      onChange(
        Object.fromEntries(
          defs.map((d) => [d.key, Math.min(d.max, Math.max(d.min, draft[d.key] ?? d.default))]),
        ),
      );
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t("home.grid.blockOptions")}
        >
          <Settings2 className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-3 p-3">
        {defs.map((def) => (
          <div key={def.key} className="space-y-1.5">
            <label htmlFor={`opt-${item.id}-${def.key}`} className="text-xs font-medium text-foreground">
              {t(`home.grid.options.${def.key}`)}
            </label>
            <Input
              id={`opt-${item.id}-${def.key}`}
              type="number"
              min={def.min}
              max={def.max}
              value={draft[def.key] ?? def.default}
              onChange={(e) => setDraft((prev) => ({ ...prev, [def.key]: e.target.valueAsNumber }))}
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("home.grid.options.range", { min: def.min, max: def.max })}
            </p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Libellé d'un bloc dans l'éditeur : nom du widget, ou titre libre d'un bloc
 *  html/markdown. À défaut de titre, l'appelant retombe sur « Bloc HTML » /
 *  « Bloc Markdown » — jamais sur un extrait du contenu, illisible. */
function blockLabel(item: WorldHomeGridItem, widgetLabel: (id: WorldHomeWidgetId) => string): string {
  if (item.type === "widget" && item.widgetId) return widgetLabel(item.widgetId);
  return item.title?.trim() ?? "";
}

/**
 * Éditeur admin de la grille de blocs de la page d'accueil (Réglages > Page
 * d'accueil) : déplacement et redimensionnement des blocs.
 *
 * Sans moteur de layout tiers — la disposition est une grille CSS, la même
 * que le rendu public (WorldHomeGridView), et les gestes ne font que produire
 * de nouveaux (x, y, w) via des fonctions pures (`moveBlock`, `resizeBlock`,
 * voir worldHomeGrid.ts). C'est un choix délibéré : react-grid-layout, utilisé
 * ici auparavant, résout les conflits en POUSSANT les blocs les uns hors des
 * autres, alors qu'une ligne est ici un simple partage de 12 colonnes entre
 * voisins. Les deux modèles se contredisaient à chaque geste (voisin renvoyé
 * à la ligne, fantôme superposé, largeurs recalculées pendant le glissement),
 * et pendant un geste c'était la librairie qui avait le dernier mot. Le
 * modèle « lignes de colonnes » rend ces états simplement impossibles.
 *
 * La persistance ne se déclenche qu'à la fin d'un geste, jamais en continu
 * pendant le glissement — même leçon que le sélecteur de couleur de l'onglet
 * Apparence plus tôt dans ce chantier.
 */
export function WorldHomeGridEditor({
  worldId,
  items,
  onItemsChange,
  onPersisted,
  gap = DEFAULT_HOME_GRID_GAP,
}: {
  worldId: string;
  items: WorldHomeGridItem[];
  onItemsChange: (items: WorldHomeGridItem[]) => void;
  onPersisted?: () => void;
  /** Gouttière — même préréglage que le rendu public, voir worldHomeGrid.ts. */
  gap?: WorldHomeGridGap;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const gapPx = HOME_GRID_GAP_PRESETS[gap];
  // Zone de saisie du diviseur, toujours au moins MIN_DIVIDER_HIT_WIDTH même
  // si la gouttière elle-même est plus étroite (voir la constante).
  const dividerHitWidth = Math.max(gapPx, MIN_DIVIDER_HIT_WIDTH);
  const { containerRef, width } = useMeasuredWidth();
  const [editingBlock, setEditingBlock] = React.useState<
    { type: "html" | "markdown"; item?: WorldHomeGridItem } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = React.useState<WorldHomeGridItem | null>(null);

  function widgetLabel(id: WorldHomeWidgetId) {
    return t(`home.widgets.${id}`);
  }

  // Deux gestes rapprochés lancent deux enregistrements concurrents : sans
  // numéro de séquence, la réponse du premier (arrivée après celle du second)
  // écraserait l'état le plus récent avec une version périmée.
  const persistSeqRef = React.useRef(0);

  async function persist(next: WorldHomeGridItem[]) {
    const previous = items;
    const seq = ++persistSeqRef.current;
    onItemsChange(next);
    const res = await setWorldHomeGrid(worldId, next);
    const isLatest = seq === persistSeqRef.current;
    if (!res.ok) {
      // Un rollback ne vaut que pour le dernier geste : revenir à `previous`
      // après un geste plus récent ramènerait un état déjà dépassé.
      if (isLatest) onItemsChange(previous);
      toast.error(res.error);
      return;
    }
    if (!isLatest) return;
    onItemsChange(res.items);
    onPersisted?.();
  }

  /** Geste en cours : bloque la persistance concurrente et sert de repère
   *  visuel (le bloc saisi passe au premier plan). */
  const [activeId, setActiveId] = React.useState<string | null>(null);
  /** Destination visée pendant un déplacement — sert uniquement à l'afficher ;
   *  la grille n'est réarrangée qu'au relâchement (voir startMove). */
  const [dropPreview, setDropPreview] = React.useState<DropTarget | null>(null);
  /** Décalage de la frontière en cours de glissement — affichage seulement. */
  const [resizePreview, setResizePreview] = React.useState<ResizePreview | null>(null);
  /** La grille elle-même — repère des coordonnées de dépôt (voir dropTarget). */
  const gridRef = React.useRef<HTMLDivElement>(null);
  /** Nombre de lignes occupées — borne le repère de dépôt. */
  const rowCount = items.reduce((max, i) => Math.max(max, i.y + 1), 0);

  /** Pas d'une colonne / d'une ligne en pixels, gouttière comprise —
   *  convertit un déplacement de curseur en unités de grille. */
  const colPitch = (width + gapPx) / HOME_GRID_COLS;
  const rowPitch = HOME_GRID_ROW_HEIGHT + gapPx;

  /**
   * Redimensionnement : la frontière suit le curseur au pixel près pendant le
   * geste, et ne se cale sur la colonne la plus proche qu'au relâchement.
   *
   * Le modèle ne connaît que des colonnes entières — arrondir en continu
   * faisait sauter la séparation d'une colonne entière à la fois (une
   * cinquantaine de pixels), ce qui rendait le geste saccadé. On applique
   * donc pendant le glissement un simple décalage visuel des deux blocs
   * concernés (marges négatives/positives, sans toucher au modèle), puis on
   * convertit ce décalage en colonnes une seule fois, à la fin.
   */
  function startResize(
    event: React.PointerEvent,
    left: WorldHomeGridItem,
    right: WorldHomeGridItem,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Garantit que CE pointeur continue d'envoyer ses événements ici même
    // s'il quitte la zone de 24px pendant le geste — surtout utile au doigt,
    // moins précis qu'un curseur pour rester sur une cible aussi fine.
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startItems = items;
    setActiveId(left.id);

    // La frontière ne peut pas réduire l'un des deux blocs sous la largeur
    // minimale : on borne le décalage en pixels, pas seulement à l'arrivée.
    const minDx = (MIN_BLOCK_W - left.w) * colPitch;
    const maxDx = (right.w - MIN_BLOCK_W) * colPitch;

    let dx = 0;
    const onPointerMove = (moveEvent: PointerEvent) => {
      dx = Math.min(Math.max(moveEvent.clientX - startX, minDx), maxDx);
      setResizePreview({ leftId: left.id, rightId: right.id, dx });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      setActiveId(null);
      setResizePreview(null);
      const columns = Math.round(dx / colPitch);
      if (columns !== 0) void persist(resizeBlock(startItems, left.id, "e", columns));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  /**
   * Cible d'un déplacement, lue à la position ABSOLUE du curseur dans la
   * grille (pas en delta depuis le point de saisie) : la zone survolée est
   * alors exactement celle qu'on voit sous le pointeur.
   *
   * Chaque ligne est découpée en trois bandes. Le curseur dans la bande
   * centrale vise la ligne elle-même — le bloc la rejoint et ils se partagent
   * la largeur. Dans une bande de bord (le quart haut ou bas, à cheval sur la
   * gouttière), il vise l'ESPACE entre deux lignes : le bloc s'y insère seul,
   * sur une nouvelle ligne. Sans ces bandes, une ligne déjà remplie absorbait
   * tout bloc qu'on tentait de faire passer au-dessus ou en dessous d'elle,
   * sans aucun moyen de l'éviter.
   */
  function dropTarget(clientX: number, clientY: number): DropTarget | null {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rowFloat = (clientY - rect.top) / rowPitch;
    const row = Math.max(0, Math.floor(rowFloat));
    const withinRow = rowFloat - Math.floor(rowFloat);
    const col = (clientX - rect.left) / colPitch;

    // Bandes larges (un tiers en haut, un tiers en bas) : créer une ligne est
    // le geste le plus courant, il ne doit pas demander de viser au pixel.
    if (withinRow < NEW_ROW_BAND) return { row, col, asNewRow: true };
    if (withinRow > 1 - NEW_ROW_BAND) return { row: row + 1, col, asNewRow: true };
    return { row, col, asNewRow: false };
  }

  /**
   * Déplacement : on n'applique RIEN pendant le glissement, on montre
   * seulement où le bloc atterrirait ; la grille n'est réarrangée qu'au
   * relâchement.
   *
   * Réarranger en continu créait une boucle : chaque réarrangement déplaçait
   * les lignes sous le curseur, ce qui changeait la cible, ce qui réarrangeait
   * à nouveau… La zone visée se dérobait au fur et à mesure qu'on l'approchait
   * — d'où la difficulté à viser l'espace entre deux lignes. Ici les repères
   * restent immobiles pendant tout le geste.
   */
  function startMove(event: React.PointerEvent, item: WorldHomeGridItem) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    setActiveId(item.id);
    let target: DropTarget | null = null;
    let moved = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moved = true;
      target = dropTarget(moveEvent.clientX, moveEvent.clientY);
      setDropPreview(target);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      setActiveId(null);
      setDropPreview(null);
      // Un simple clic sur la poignée ne doit rien réécrire.
      if (moved && target) {
        void persist(moveBlock(items, item.id, target.row, target.col, target.asNewRow));
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  /** Prochaine ligne libre — un bloc par ligne, `y` séquentiel. */
  function nextY() {
    return items.reduce((max, i) => Math.max(max, i.y + 1), 0);
  }

  function addWidget(widgetId: WorldHomeWidgetId) {
    const newItem: WorldHomeGridItem = {
      id: crypto.randomUUID(),
      type: "widget",
      x: 0,
      y: nextY(),
      w: HOME_GRID_COLS,
      widgetId,
    };
    void persist([...items, newItem]);
  }

  function saveBlock(content: string, title: string, field: "html" | "content") {
    const trimmedTitle = title.trim();
    const editing = editingBlock?.item;
    const next = editing
      ? items.map((i) =>
          i.id === editing.id ? { ...i, [field]: content, title: trimmedTitle || undefined } : i,
        )
      : [
          ...items,
          {
            id: crypto.randomUUID(),
            type: editingBlock!.type,
            x: 0,
            y: nextY(),
            w: HOME_GRID_COLS,
            [field]: content,
            ...(trimmedTitle ? { title: trimmedTitle } : {}),
          } as WorldHomeGridItem,
        ];
    void persist(next);
    setEditingBlock(null);
  }

  function removeBlock(item: WorldHomeGridItem) {
    // Renumérote les lignes tout de suite : sans ça la ligne libérée resterait
    // visible comme un trou le temps de l'aller-retour serveur (qui compacte
    // aussi, voir setWorldHomeGrid).
    void persist(compactHomeGridRows(items.filter((i) => i.id !== item.id)));
    setConfirmDelete(null);
  }

  const usedWidgetIds = new Set(items.filter((i) => i.widgetId).map((i) => i.widgetId));
  const availableWidgets = ALL_WORLD_HOME_WIDGETS.filter(
    (id) => id !== "announcement" && !usedWidgetIds.has(id),
  );

  return (
    <div className="space-y-3">
      <DeleteConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={t("home.grid.deleteTitle")}
        description={t("home.grid.deleteDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => { if (confirmDelete) removeBlock(confirmDelete); }}
      />

      <WorldHomeHtmlBlockEditor
        open={editingBlock?.type === "html"}
        onOpenChange={(open) => { if (!open) setEditingBlock(null); }}
        initialHtml={editingBlock?.item?.html}
        initialTitle={editingBlock?.item?.title}
        onSave={(html, title) => saveBlock(html, title, "html")}
      />
      <WorldHomeMarkdownBlockEditor
        open={editingBlock?.type === "markdown"}
        onOpenChange={(open) => { if (!open) setEditingBlock(null); }}
        initialContent={editingBlock?.item?.content}
        initialTitle={editingBlock?.item?.title}
        onSave={(content, title) => saveBlock(content, title, "content")}
      />

      <div ref={containerRef} className="rounded-lg border border-dashed p-2">
        {items.length > 0 && (
          // Grille CSS pure — exactement le mécanisme du rendu public
          // (WorldHomeGridView) : l'éditeur montre donc littéralement la
          // disposition finale, et il n'y a plus de moteur de layout à
          // synchroniser avec nos propres calculs. Les gestes ne font que
          // produire de nouveaux (x, y, w) ; le navigateur place le reste.
          <div
            ref={gridRef}
            className="grid grid-cols-12"
            style={{ gap: gapPx, gridAutoRows: `${HOME_GRID_ROW_HEIGHT}px` }}
          >
            {/* Grillage des 12 colonnes, visible seulement pendant un geste
                (déplacement ou redimensionnement) — repère visuel pour aligner
                un bloc pendant qu'on le glisse, sans encombrer la vue au repos.
                Un trait par frontière interne (11, comme `rowBoundaries` mais
                pour les 12 colonnes entières plutôt que les seuls blocs
                existants), centré sur le MILIEU de la gouttière — pas calé
                sur le bord d'une piste — avec la même formule que le
                diviseur de redimensionnement (`.wghe-divider` : le centre
                d'un élément posé au début de la colonne de droite et décalé
                de `-(gap + largeur)/2` ne dépend pas de sa largeur, donc
                `-gapPx / 2` centre exactement un trait de largeur nulle). */}
            {activeId && rowCount > 0 &&
              Array.from({ length: HOME_GRID_COLS - 1 }, (_, i) => (
                <div
                  key={i}
                  aria-hidden
                  data-testid="wghe-column-grid-line"
                  style={{ gridColumn: i + 2, gridRow: `1 / ${rowCount + 1}`, marginLeft: -gapPx / 2 }}
                  className="pointer-events-none z-0 justify-self-start self-stretch border-l border-dashed"
                />
              ))}

            {items.map((item) => (
              // Le bloc se réduit à sa barre de titre : l'éditeur sert à
              // agencer, pas à prévisualiser — un corps vide ne ferait que
              // répéter le libellé en occupant de la hauteur pour rien.
              //
              // `select-none` : sans lui, glisser un bloc (ou sa frontière)
              // sélectionne son libellé au passage, laissant du texte
              // surligné en travers de l'éditeur. Rien n'est à copier ici —
              // ce ne sont que des étiquettes d'agencement.
              <div
                key={item.id}
                data-block-id={item.id}
                style={{
                  gridColumn: `${item.x + 1} / span ${item.w}`,
                  gridRow: item.y + 1,
                  // Décalage visuel pendant un glissement de frontière : le
                  // bloc de gauche déborde de sa case (marge négative), celui
                  // de droite se rétracte d'autant. La grille, elle, ne bouge
                  // pas — elle sera recalculée au relâchement.
                  ...(resizePreview?.leftId === item.id && { marginRight: -resizePreview.dx }),
                  ...(resizePreview?.rightId === item.id && { marginLeft: resizePreview.dx }),
                }}
                className={cn(
                  "group relative flex select-none flex-col overflow-hidden rounded-lg border border-border-soft bg-muted/30",
                  // Blocs concernés par le geste en cours, signalés par leur
                  // transparence plutôt que par un contour : une bordure
                  // ajoutée en cours de geste élargit la boîte et fait bouger
                  // ce qu'on est justement en train de viser.
                  //
                  // Un redimensionnement en concerne DEUX — la frontière
                  // appartient autant à l'un qu'à l'autre, et les deux
                  // changent de largeur ensemble. N'en marquer qu'un seul
                  // laissait croire que l'autre ne bougeait pas.
                  (activeId === item.id ||
                    resizePreview?.leftId === item.id ||
                    resizePreview?.rightId === item.id) &&
                    "z-10 opacity-50",
                )}
              >
                <div
                  onPointerDown={(event) => startMove(event, item)}
                  // `touch-none` (touch-action: none) : sans lui, un doigt qui
                  // appuie puis bouge sur la poignée déclenche le défilement
                  // natif de la page au lieu du geste — le navigateur
                  // interprète le mouvement comme un scroll AVANT même que
                  // notre JS ne reçoive le premier pointermove.
                  className="wghe-drag-handle flex h-full touch-none cursor-grab items-center gap-1.5 bg-muted/60 px-2 text-xs text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0" />
                  {item.type === "html" && <Code2 className="h-3 w-3 shrink-0" />}
                  {item.type === "markdown" && <FileText className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{blockLabel(item, widgetLabel) || t(`home.grid.${item.type}BlockTitle`)}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {item.type !== "widget" && (
                      <button
                        type="button"
                        onClick={() => setEditingBlock({ type: item.type as "html" | "markdown", item })}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={t("home.grid.editBlock")}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {item.widgetId && WORLD_HOME_WIDGET_OPTIONS[item.widgetId] && (
                      <WidgetOptionsPopover
                        item={item}
                        defs={WORLD_HOME_WIDGET_OPTIONS[item.widgetId]!}
                        onChange={(options) => void persist(
                          items.map((i) => (i.id === item.id ? { ...i, options } : i)),
                        )}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(item)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={tCommon("delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

              </div>
            ))}

            {/* La gouttière ELLE-MÊME est le diviseur : un point de saisie par
                frontière, plutôt que deux poignées de blocs voisins qui se
                chevauchaient dans le même espace (celle du dessus l'emportait,
                sans que rien ne le laisse deviner).

                Placé dans la première colonne du bloc de droite puis décalé
                d'une gouttière vers la gauche (`marginLeft` négatif), il vient
                occuper exactement l'espace entre les deux — sans calcul de
                pixels : c'est la grille CSS qui donne la position, comme pour
                les blocs. Il s'étire sur toute la hauteur de la ligne. */}
            {/* Repère de dépôt, pendant un déplacement seulement.
                — Trait horizontal : le bloc s'insérera SEUL sur une nouvelle
                  ligne, à cet endroit. Posé dans la gouttière, entre les deux
                  lignes concernées.
                — Aplat coloré : le bloc REJOINDRA cette ligne et s'y
                  partagera la largeur. Un aplat plutôt qu'un contour : une
                  bordure s'ajoute à la boîte et décale ce qu'elle entoure.
                Sans ce repère, les deux issues étaient indiscernables avant
                le relâchement. */}
            {dropPreview?.asNewRow && rowCount > 0 && (
              <div
                aria-hidden
                style={{
                  gridColumn: "1 / -1",
                  gridRow: Math.min(dropPreview.row + 1, rowCount),
                  alignSelf: dropPreview.row >= rowCount ? "end" : "start",
                  [dropPreview.row >= rowCount ? "marginBottom" : "marginTop"]: -(gapPx / 2 + 1),
                  height: 2,
                }}
                className="pointer-events-none z-20 rounded-full bg-primary"
              />
            )}
            {dropPreview && !dropPreview.asNewRow && dropPreview.row < rowCount && (
              <div
                aria-hidden
                style={{ gridColumn: "1 / -1", gridRow: dropPreview.row + 1 }}
                className="pointer-events-none z-20 rounded-lg bg-primary/15"
              />
            )}

            {rowBoundaries(items).map(({ left, right }) => (
              <button
                key={`boundary-${right.id}`}
                type="button"
                aria-label={t("home.grid.resizeBoundary")}
                onPointerDown={(event) => startResize(event, left, right)}
                style={{
                  gridColumn: right.x + 1,
                  gridRow: right.y + 1,
                  width: dividerHitWidth,
                  // Centre la zone de saisie sur la gouttière réelle, même
                  // élargie au-delà de sa largeur visuelle — voir le calcul
                  // dans MIN_DIVIDER_HIT_WIDTH.
                  marginLeft: -(gapPx + dividerHitWidth) / 2,
                  // Suit le curseur avec les deux blocs qu'il sépare.
                  ...(resizePreview?.rightId === right.id && {
                    transform: `translateX(${resizePreview.dx}px)`,
                  }),
                }}
                // `touch-none` : même raison que sur la poignée de
                // déplacement — sans lui un doigt qui tire la frontière fait
                // défiler la page au lieu de redimensionner.
                className={cn(
                  "wghe-divider relative z-10 touch-none cursor-ew-resize justify-self-start self-stretch",
                  // Le trait reste visible tant qu'on tire, même si le curseur
                  // s'éloigne de la zone de saisie.
                  resizePreview?.rightId === right.id && "wghe-divider-active",
                )}
              />
            ))}
          </div>
        )}

        {items.length === 0 && (
          <p className={cn("px-2 py-4 text-center text-xs text-muted-foreground/60")}>{t("home.noWidgets")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {availableWidgets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> {t("home.addWidget")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {availableWidgets.map((id) => (
                <DropdownMenuItem key={id} onClick={() => addWidget(id)}>
                  {widgetLabel(id)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> {t("home.grid.addBlock")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setEditingBlock({ type: "html" })}>
              <Code2 className="mr-2 h-3.5 w-3.5" /> {t("home.grid.htmlBlockTitle")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditingBlock({ type: "markdown" })}>
              <FileText className="mr-2 h-3.5 w-3.5" /> {t("home.grid.markdownBlockTitle")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
