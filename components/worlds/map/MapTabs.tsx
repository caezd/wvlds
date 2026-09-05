"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Loader2, MoreVertical, Plus } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MAX_MAPS_PER_WORLD } from "@/lib/constants";
import type { WorldMapData } from "@/app/actions/worldMap";

/** Identifiant DOM d'un onglet, partagé avec le panneau qu'il commande. */
export const mapTabId = (mapId: string) => `map-tab-${mapId}`;
export const MAP_PANEL_ID = "map-panel";

type TabProps = {
  carte: WorldMapData;
  actif: boolean;
  onSelect: (mapId: string) => void;
  /** Les commandes de la carte : elles ne concernent que l'onglet actif. */
  actions?: MapTabActions;
};

/**
 * Ce qu'on peut faire à la carte qu'on regarde, depuis son onglet.
 *
 * Ces commandes vivaient dans l'en-tête du panneau, à distance de ce sur quoi
 * elles portent : l'en-tête ne dit pas QUELLE carte on renomme ou on
 * supprime, l'onglet si.
 */
export type MapTabActions = {
  onRename: (mapId: string, label: string) => void;
  onChangeImage: () => void;
  onDelete: () => void;
  /** Une image est en train de partir : le menu patiente. */
  uploading: boolean;
};

/**
 * L'onglet lui-même, sans rien savoir du glisser-déposer.
 *
 * Le fond est porté par l'enveloppe et non par le bouton : le menu « ⋮ » de
 * l'onglet actif partage ainsi sa pastille, au lieu de flotter à côté.
 *
 * Le nom se corrige sur place — double-clic sur l'onglet ouvert, ou
 * « Renommer » dans le menu. Le bouton redevient un `role="tab"` sitôt la
 * saisie finie : un champ de texte ne tient pas ce rôle, et la barre d'onglets
 * ne doit pas en perdre un.
 */
function TabButton({
  carte,
  actif,
  onSelect,
  actions,
  style,
}: TabProps & { style?: React.CSSProperties }) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const nom = carte.label?.trim() || t("title");

  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(carte.label ?? "");

  function commencerARenommer() {
    setDraft(carte.label ?? "");
    setRenaming(true);
  }

  function valider() {
    setRenaming(false);
    const valeur = draft.trim();
    if (valeur !== (carte.label ?? "")) actions?.onRename(carte.id, valeur);
  }

  return (
    <span
      style={style}
      className={cn(
        "flex shrink-0 items-center rounded-md transition-colors",
        actif ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
      )}
    >
      {renaming ? (
        <input
          autoFocus
          value={draft}
          aria-label={t("mapLabel")}
          placeholder={t("title")}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            e.stopPropagation(); // les flèches appartiennent au texte, pas à la barre
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { setRenaming(false); }
          }}
          className="w-28 rounded-md border border-border-soft bg-background px-2 py-0.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <button
          id={mapTabId(carte.id)}
          type="button"
          role="tab"
          aria-selected={actif}
          aria-controls={MAP_PANEL_ID}
          // Roving tabindex : la tabulation entre dans la barre et en sort, les
          // flèches circulent dedans.
          tabIndex={actif ? 0 : -1}
          onClick={(e) => { e.stopPropagation(); onSelect(carte.id); }}
          onDoubleClick={() => { if (actif && actions) commencerARenommer(); }}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !actif && "hover:text-foreground",
          )}
        >
          {nom}
        </button>
      )}

      {actif && actions && !renaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("mapActions", { label: nom })}
              onClick={(e) => e.stopPropagation()}
              className="mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {actions.uploading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <MoreVertical className="h-3.5 w-3.5" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem onSelect={commencerARenommer}>{tCommon("rename")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.onChangeImage}>{t("changeMap")}</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={actions.onDelete}
              className="text-destructive focus:text-destructive"
            >
              {t("deleteMap")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  );
}

/**
 * Le même onglet, précédé d'une poignée pour le déplacer.
 *
 * La poignée, et non l'onglet entier : le clavier ne peut pas servir deux
 * maîtres. Sur l'onglet, `Espace` l'active et les flèches passent au suivant ;
 * ce sont exactement les touches dont `@dnd-kit` se sert pour saisir et
 * déplacer. Séparer les deux rend chacun sans ambiguïté — et le glisser reste
 * accessible au clavier, ce qu'un déplacement à la souris seule ne serait pas.
 */
function SortableTab({ carte, actif, onSelect, actions }: TabProps) {
  const t = useTranslations("map");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: carte.id });

  return (
    <div
      ref={setNodeRef}
      // Un conteneur neutre : l'onglet doit rester l'enfant sémantique de la
      // barre, pas ce div.
      role="presentation"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex shrink-0 items-center gap-0.5", isDragging && "z-10 opacity-70")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("reorderMap", { label: carte.label?.trim() || t("title") })}
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <TabButton carte={carte} actif={actif} onSelect={onSelect} actions={actions} />
    </div>
  );
}

/**
 * Les cartes d'un monde, en onglets.
 *
 * La barre ne paraît que lorsqu'elle sert : un monde à carte unique la garde
 * cachée et la carte occupe tout le cadre, comme avant. En mode édition, elle
 * s'affiche dès la première carte — c'est là que se trouve le bouton d'ajout.
 *
 * Le motif ARIA des onglets est suivi jusqu'au bout : un seul onglet dans
 * l'ordre de tabulation, les flèches passent de l'un à l'autre, `Origine` et
 * `Fin` sautent aux extrémités. À moitié implémenté, il vaudrait moins que de
 * simples boutons — un lecteur d'écran annoncerait « onglet 2 sur 3 » pour une
 * liste que le clavier ne parcourt pas.
 */
export function MapTabs({
  maps,
  activeId,
  isEditMode,
  creating,
  actions,
  onSelect,
  onAdd,
  onReorder,
}: {
  maps: WorldMapData[];
  activeId: string | null;
  isEditMode: boolean;
  creating: boolean;
  /** Les commandes de la carte active — absentes hors édition. */
  actions: MapTabActions;
  onSelect: (mapId: string) => void;
  onAdd: () => void;
  /** Nouvel ordre des cartes, du premier onglet au dernier. */
  onReorder: (orderedIds: string[]) => void;
}) {
  const t = useTranslations("map");
  const complet = maps.length >= MAX_MAPS_PER_WORLD;

  const sensors = useSensors(
    // Un seuil : sans lui, le moindre frémissement de souris sur la poignée
    // passerait pour un glisser.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const depuis = maps.findIndex((m) => m.id === active.id);
    const vers = maps.findIndex((m) => m.id === over.id);
    if (depuis < 0 || vers < 0) return;
    onReorder(arrayMove(maps, depuis, vers).map((m) => m.id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const pas =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? 0 : e.key === "End" ? 0 : null;
    if (pas === null) return;
    // Les flèches appartiennent à `@dnd-kit` pendant un déplacement : c'est lui
    // qui écoute sur la poignée, et l'onglet n'a alors pas le focus.
    if ((e.target as HTMLElement)?.getAttribute("role") !== "tab") return;
    e.preventDefault();

    const courant = maps.findIndex((m) => m.id === activeId);
    const cible =
      e.key === "Home"
        ? maps[0]
        : e.key === "End"
          ? maps[maps.length - 1]
          : maps[(Math.max(0, courant) + pas + maps.length) % maps.length];
    if (!cible) return;

    onSelect(cible.id);
    // Le focus suit la sélection : c'est ce qu'attend le motif ARIA quand les
    // onglets s'activent au déplacement.
    //
    // Déplacé TOUT DE SUITE, sans attendre le rendu : tous les onglets sont
    // déjà dans le DOM, seul leur `tabIndex` change. Différer d'une image
    // laissait au contraire une tâche en vol capable de voler le focus après
    // le démontage du composant — c'est ce qui rendait un test instable une
    // fois sur trois.
    document.getElementById(mapTabId(cible.id))?.focus();
  }

  const boutonAjouter = isEditMode && (
    <button
      type="button"
      aria-label={t("addMap")}
      title={complet ? t("maxMapsReached") : t("addMap")}
      disabled={complet || creating}
      onClick={(e) => { e.stopPropagation(); onAdd(); }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
    </button>
  );

  const classeBarre =
    "flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-soft bg-background px-2 py-1";

  // Hors édition, pas de contexte de glisser-déposer : il ne servirait à
  // personne et monterait ses écouteurs pour rien.
  if (!isEditMode) {
    return (
      <div role="tablist" aria-label={t("mapsTablist")} onKeyDown={handleKeyDown} className={classeBarre}>
        {maps.map((carte) => (
          <TabButton key={carte.id} carte={carte} actif={carte.id === activeId} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div role="tablist" aria-label={t("mapsTablist")} onKeyDown={handleKeyDown} className={classeBarre}>
        <SortableContext items={maps.map((m) => m.id)} strategy={horizontalListSortingStrategy}>
          {maps.map((carte) => (
            <SortableTab
              key={carte.id}
              carte={carte}
              actif={carte.id === activeId}
              onSelect={onSelect}
              actions={actions}
            />
          ))}
        </SortableContext>
        {boutonAjouter}
      </div>
    </DndContext>
  );
}
