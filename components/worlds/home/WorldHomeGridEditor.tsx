"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import * as React from "react";
import { useTranslations } from "next-intl";
import ReactGridLayout, { type Layout, type EventCallback, type LayoutItem } from "react-grid-layout";
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
  findRightNeighbor,
  HOME_GRID_COLS,
  HOME_GRID_ROW_HEIGHT,
  widgetOptionValue,
  WORLD_HOME_WIDGET_OPTIONS,
  type WorldHomeGridItem,
  type WorldHomeWidgetOption,
} from "./worldHomeGrid";

/** Largeur minimale d'un bloc, en colonnes (miroir de la validation serveur). */
const MIN_BLOCK_W = 2;
import { WorldHomeHtmlBlockEditor } from "./blocks/WorldHomeHtmlBlockEditor";
import { WorldHomeMarkdownBlockEditor } from "./blocks/WorldHomeMarkdownBlockEditor";

/**
 * Largeur de CONTENU du conteneur (hors `border`/`padding`) — react-grid-layout
 * positionne ses colonnes dans cette zone, pas dans la boîte pleine renvoyée
 * par `getBoundingClientRect()`. Notre conteneur a son propre `border` et
 * `p-2` : les compter en trop surdimensionnait la grille d'une quinzaine de
 * pixels en continu (pas un à-coup ponctuel — un écart constant, présent dès
 * que l'onglet est chargé). `getComputedStyle(node).width` résout toujours
 * la largeur de contenu, y compris sous `box-sizing: border-box` — c'est le
 * même calcul que `getContentWidth()` dans react-grid-layout, repris ici pour
 * rester cohérent avec la mesure que ferait la librairie elle-même.
 */
/** Exporté uniquement pour être testable isolément — pas d'usage prévu hors ce fichier. */
export function getContentWidth(node: HTMLElement): number {
  const style = window.getComputedStyle(node);
  const parsed = Number.parseFloat(style.width);
  if (Number.isFinite(parsed)) return Math.max(0, parsed);
  const px = (v: string) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
  return Math.max(0, node.clientWidth - px(style.paddingLeft) - px(style.paddingRight));
}

/**
 * Largeur du conteneur, mesurée nous-mêmes plutôt que via le
 * `useContainerWidth()` de react-grid-layout : ce dernier mesure dans un
 * `useEffect` (après la peinture du navigateur), donc même avec son option
 * `measureBeforeMount`, un premier rendu (vide) est toujours peint avant
 * que le vrai contenu n'apparaisse — un à-coup résiduel. `useLayoutEffect`
 * mesure de façon synchrone, avant la peinture : le tout premier rendu
 * visible porte déjà la bonne largeur, sans transition à corriger après coup.
 */
function useMeasuredWidth(): { containerRef: React.RefObject<HTMLDivElement | null>; width: number; measured: boolean } {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  // Séparé de `width` : sous jsdom (tests), la mesure renvoie toujours 0
  // (pas de moteur de mise en page réel) — `width > 0` ne deviendrait donc
  // jamais vrai. Ce drapeau ne dit qu'une chose : une mesure a eu lieu, peu
  // importe le résultat.
  const [measured, setMeasured] = React.useState(false);

  React.useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setWidth(Math.round(getContentWidth(node)));
    setMeasured(true);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      // `entry.contentRect` exclut déjà `border`/`padding` — cohérent avec
      // `getContentWidth()` ci-dessus pour la mesure initiale.
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { containerRef, width, measured };
}

/** Fusionne les positions/largeurs renvoyées par react-grid-layout dans les
 *  items existants (par id) — `h` est ignoré : la hauteur n'est pas réglable,
 *  chaque bloc occupe une ligne qui s'auto-dimensionne au rendu. */
function mergeLayout(items: WorldHomeGridItem[], layout: Layout): WorldHomeGridItem[] {
  const byId = new Map(layout.map((l) => [l.i, l]));
  return items.map((item) => {
    const l = byId.get(item.id);
    return l ? { ...item, x: l.x, y: l.y, w: l.w } : item;
  });
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
 * d'accueil) — déplacement/redimensionnement libres via react-grid-layout,
 * chargé uniquement ici (pas dans le rendu public, voir WorldHomeGridView.tsx).
 * La persistance ne se déclenche qu'à la fin d'un geste (onDragStop/
 * onResizeStop), jamais en continu pendant le glissement — même leçon que
 * le sélecteur de couleur de l'onglet Apparence plus tôt dans ce chantier.
 */
export function WorldHomeGridEditor({
  worldId,
  items,
  onItemsChange,
  onPersisted,
}: {
  worldId: string;
  items: WorldHomeGridItem[];
  onItemsChange: (items: WorldHomeGridItem[]) => void;
  onPersisted?: () => void;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const { containerRef, width, measured } = useMeasuredWidth();
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

  // Un redimensionnement en cours ajuste aussi le voisin (voir handleResize) ;
  // onLayoutChange, qui se déclenche également pendant ce geste, écraserait
  // cet ajustement avec le layout brut de react-grid-layout.
  const resizingRef = React.useRef(false);

  function handleLayoutChange(layout: Layout) {
    if (resizingRef.current) return;
    // Retour visuel continu pendant le glissement — état local uniquement,
    // aucune écriture réseau tant que le geste n'est pas terminé.
    onItemsChange(mergeLayout(items, layout));
  }

  const handleGestureStop: EventCallback = (layout) => {
    void persist(mergeLayout(items, layout));
  };

  /**
   * Redimensionnement en tandem : élargir un bloc rétrécit d'autant son
   * voisin de droite (et inversement), de sorte que glisser leur frontière
   * commune déplace vraiment la séparation entre les deux colonnes.
   *
   * Le calcul part de l'état d'AVANT le geste (`items`) et de la seule
   * largeur demandée, jamais du layout renvoyé par react-grid-layout : sa
   * compaction a déjà, à ce stade, poussé le voisin sur une autre ligne
   * (le bloc élargi ne tenait plus à côté de lui) — le corriger après coup
   * reviendrait à rattraper un déplacement qu'on ne veut pas du tout. La
   * paire conserve donc sa ligne et sa largeur totale ; seule la frontière
   * bouge, bornée pour qu'aucun des deux ne passe sous la largeur minimale.
   */
  const handleResize: EventCallback = (layout, oldItem, newItem) => {
    resizingRef.current = true;
    if (!newItem) return;
    const previous = items.find((i) => i.id === newItem.i);
    if (!previous) return;

    const neighbor = findRightNeighbor(items, previous);
    if (!neighbor) {
      // Pas de voisin : simple élargissement, borné au bord de la grille.
      const w = Math.max(MIN_BLOCK_W, Math.min(newItem.w, HOME_GRID_COLS - previous.x));
      onItemsChange(items.map((i) => (i.id === previous.id ? { ...i, w } : i)));
      return;
    }

    const total = previous.w + neighbor.w;
    const w = Math.max(MIN_BLOCK_W, Math.min(newItem.w, total - MIN_BLOCK_W));
    onItemsChange(
      items.map((i) => {
        if (i.id === previous.id) return { ...i, w };
        if (i.id === neighbor.id) return { ...i, x: previous.x + w, w: total - w };
        return i;
      }),
    );
  };

  const handleResizeStop: EventCallback = () => {
    // `items` porte déjà le résultat du geste (appliqué par handleResize) —
    // on persiste cet état plutôt que le layout brut de react-grid-layout,
    // qui ignore l'ajustement du voisin. Le drapeau ne retombe qu'après la
    // frame courante : react-grid-layout émet encore un onLayoutChange (avec
    // sa version compactée) juste après ce callback, qui écraserait sinon
    // l'ajustement qu'on vient d'appliquer.
    requestAnimationFrame(() => {
      resizingRef.current = false;
    });
    void persist(items);
  };

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

  // `h: 1` figé et poignée de redimensionnement limitée au bord droit ("e") :
  // seule la largeur se règle, la hauteur suit le contenu au rendu.
  const layout: Layout = items.map(
    (item): LayoutItem => ({ i: item.id, x: item.x, y: item.y, w: item.w, h: 1, minW: 2, minH: 1, maxH: 1 }),
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
        {measured && items.length > 0 && (
          <ReactGridLayout
            // Même raison que `!transition-none` sur chaque bloc plus bas :
            // le conteneur racine, lui, anime sa hauteur en continu — visible
            // comme un étirement vertical au montage, avant même de compter
            // le glissement horizontal des blocs.
            className="!transition-none"
            layout={layout}
            width={width}
            gridConfig={{ cols: HOME_GRID_COLS, rowHeight: HOME_GRID_ROW_HEIGHT, margin: [8, 8] }}
            dragConfig={{ handle: ".wghe-drag-handle" }}
            // Poignée "e" (bord droit) uniquement : glisser la frontière
            // entre deux colonnes élargit l'un et rétrécit l'autre. Pas de
            // poignée verticale — la hauteur n'est pas réglable.
            resizeConfig={{ handles: ["e"] }}
            onLayoutChange={handleLayoutChange}
            onDragStop={handleGestureStop}
            onResize={handleResize}
            onResizeStop={handleResizeStop}
          >
            {items.map((item) => (
              // Le bloc se réduit à sa barre de titre : l'éditeur sert à
              // agencer, pas à prévisualiser — un corps vide ne ferait que
              // répéter le libellé en occupant de la hauteur pour rien.
              //
              // `!transition-none` : le CSS de react-grid-layout anime en
              // continu (`transition: all 200ms`) tout changement de
              // position/taille d'un bloc, hors glisser-déposer actif (qui
              // s'en affranchit déjà via ses propres classes d'état). Cette
              // transition permanente jouait aussi au montage — un bloc qui
              // vient d'apparaître glissait visiblement vers sa position,
              // au lieu d'y être direct. `!important` nécessaire : la classe
              // `.react-grid-item`, posée par la librairie sur ce même
              // élément, a la même spécificité qu'une classe Tailwind.
              <div
                key={item.id}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-border-soft bg-muted/30 !transition-none"
              >
                <div className="wghe-drag-handle flex h-full cursor-grab items-center gap-1.5 bg-muted/60 px-2 text-xs text-muted-foreground active:cursor-grabbing">
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
          </ReactGridLayout>
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
