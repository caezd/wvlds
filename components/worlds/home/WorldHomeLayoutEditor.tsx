"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  type DragEndEvent,
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
import { GripVertical, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_WORLD_HOME_WIDGETS, type WorldHomeWidgetId } from "./worldHomeWidgets";

function WidgetRow({
  id,
  label,
  onRemove,
}: {
  id: WorldHomeWidgetId;
  label: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
    >
      <span {...attributes} {...listeners} className="shrink-0 touch-none cursor-grab text-muted-foreground/50">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-sm">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Éditeur admin de la page d'accueil : réordonner (drag), retirer, ajouter
 * des widgets. Persistance optimiste sur `worlds.home_layout`, protégée
 * côté serveur par la policy RLS "worlds update by admin".
 */
export function WorldHomeLayoutEditor({
  worldId,
  layout,
  onLayoutChange,
  onPersisted,
}: {
  worldId: string;
  layout: WorldHomeWidgetId[];
  onLayoutChange: (next: WorldHomeWidgetId[]) => void;
  /** Appelé une fois l'écriture confirmée en base (pas sur l'application optimiste ni le rollback). */
  onPersisted?: () => void;
}) {
  const t = useTranslations("worlds");
  const supabase = React.useMemo(() => createClient(), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const widgetLabel = (id: WorldHomeWidgetId) => t(`home.widgets.${id}`);

  async function persist(next: WorldHomeWidgetId[]) {
    const previous = layout;
    onLayoutChange(next);
    const { error } = await supabase.from("worlds").update({ home_layout: next }).eq("id", worldId);
    if (error) {
      onLayoutChange(previous);
      toast.error(error.message);
      return;
    }
    onPersisted?.();
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIdx = layout.indexOf(active.id as WorldHomeWidgetId);
    const newIdx = layout.indexOf(over.id as WorldHomeWidgetId);
    if (oldIdx === -1 || newIdx === -1) return;
    void persist(arrayMove(layout, oldIdx, newIdx));
  }

  function removeWidget(id: WorldHomeWidgetId) {
    void persist(layout.filter((w) => w !== id));
  }

  function addWidget(id: WorldHomeWidgetId) {
    if (layout.includes(id)) return;
    void persist([...layout, id]);
  }

  const available = ALL_WORLD_HOME_WIDGETS.filter((id) => !layout.includes(id));

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={layout} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {layout.map((id) => (
              <WidgetRow key={id} id={id} label={widgetLabel(id)} onRemove={() => removeWidget(id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {layout.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground/60">{t("home.noWidgets")}</p>
      )}

      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("home.addWidget")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {available.map((id) => (
              <DropdownMenuItem key={id} onClick={() => addWidget(id)}>
                {widgetLabel(id)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
