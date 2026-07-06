"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/persona-display";
import { PersonaCard } from "./PersonaCard";
import { movePersona, duplicatePersona } from "@/app/(protected)/p/actions";
import type { PersonaSectionWithFields } from "@/types/personas";
import type { AvatarConfigV1 } from "./avatar/PersonaAvatarPicker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export type PersonaItem = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  avatar_config?: unknown;
  avatar_frame_id?: string | null;
  frame_asset_url?: string | null;
  banner_url?: string | null;
  world_id: string | null;
  sections: PersonaSectionWithFields[];
};

export type PersonaWorldGroup = {
  worldId: string | null;
  worldName: string | null;
  /** Restrictions de catalogue du monde, appliquées par l'éditeur de fiche. */
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  personas: PersonaItem[];
};

// Clé de zone droppable : les ids dnd-kit doivent être non-null.
const NO_WORLD_KEY = "__none__";
const keyFor = (worldId: string | null) => worldId ?? NO_WORLD_KEY;
const worldIdFor = (key: string) => (key === NO_WORLD_KEY ? null : key);

type PendingDrop = {
  persona: PersonaItem;
  toWorldId: string | null;
  toWorldName: string | null;
};

function PersonaCardFor({
  persona,
  group,
}: {
  persona: PersonaItem;
  group?: PersonaWorldGroup;
}) {
  return (
    <PersonaCard
      personaId={persona.id}
      personaName={persona.name ?? "Sans nom"}
      avatarUrl={persona.avatar_url}
      avatarConfig={persona.avatar_config as AvatarConfigV1 | null}
      bannerUrl={persona.banner_url}
      initialFrameId={persona.avatar_frame_id ?? null}
      initialFrameUrl={persona.frame_asset_url ?? null}
      initialSections={persona.sections}
      worldId={persona.world_id ?? undefined}
      restrictInventory={group?.restrictInventory}
      restrictSkills={group?.restrictSkills}
    />
  );
}

function DraggablePersona({
  persona,
  group,
}: {
  persona: PersonaItem;
  group?: PersonaWorldGroup;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: persona.id,
    data: { persona, fromKey: keyFor(persona.world_id) },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "manipulation" }}
      className={cn(isDragging && "opacity-40")}
    >
      <PersonaCardFor persona={persona} group={group} />
    </div>
  );
}

function DroppableGroup({
  groupKey,
  children,
}: {
  groupKey: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: groupKey });
  const fromKey = active?.data.current?.fromKey as string | undefined;
  const highlighted = isOver && fromKey !== undefined && fromKey !== groupKey;
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-2xl -m-2 p-2 transition-colors",
        highlighted && "bg-primary/5 ring-2 ring-primary/40",
      )}
    >
      {children}
    </section>
  );
}

export function PersonasView({
  groups,
  personaLimit,
}: {
  groups: PersonaWorldGroup[];
  /** Limite de personas par monde (plan gratuit), null = illimité. */
  personaLimit?: number | null;
}) {
  const t = useTranslations("personas");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [view, setView] = useState<"worlds" | "alpha">("worlds");
  const [activePersona, setActivePersona] = useState<PersonaItem | null>(null);
  const [pending, setPending] = useState<PendingDrop | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Garde les dernières valeurs pour l'animation de fermeture du dialogue :
  // sans ça, le contenu flashe sur les fallbacks (« Sans nom ») pendant
  // que le dialogue se referme, pending étant déjà remis à null.
  const lastPendingRef = useRef<PendingDrop | null>(null);
  if (pending) lastPendingRef.current = pending;
  const displayedDrop = pending ?? lastPendingRef.current;

  // Une distance d'activation préserve le clic simple (ouverture de la
  // fiche d'édition) : le drag ne démarre qu'après 8px de déplacement.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // La section "Sans monde" sert toujours de cible de dépôt, même vide.
  const displayGroups = useMemo<PersonaWorldGroup[]>(() => {
    if (groups.some((g) => g.worldId === null)) return groups;
    return [...groups, { worldId: null, worldName: null, personas: [] }];
  }, [groups]);

  const alphabetical = useMemo(() => {
    const groupByKey = new Map(groups.map((g) => [keyFor(g.worldId), g]));
    return {
      personas: groups
        .flatMap((g) => g.personas)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      groupByKey,
    };
  }, [groups]);

  function onDragStart(event: DragStartEvent) {
    setActivePersona(
      (event.active.data.current?.persona as PersonaItem) ?? null,
    );
  }

  function onDragEnd(event: DragEndEvent) {
    setActivePersona(null);
    const { active, over } = event;
    if (!over) return;
    const persona = active.data.current?.persona as PersonaItem | undefined;
    const fromKey = active.data.current?.fromKey as string | undefined;
    if (!persona || fromKey === undefined || over.id === fromKey) return;

    const toWorldId = worldIdFor(String(over.id));
    const toGroup = displayGroups.find((g) => g.worldId === toWorldId);
    setPending({
      persona,
      toWorldId,
      toWorldName: toGroup?.worldName ?? null,
    });
  }

  function confirmAction(kind: "move" | "duplicate") {
    const drop = pending;
    if (!drop) return;
    startTransition(async () => {
      const action = kind === "move" ? movePersona : duplicatePersona;
      const res = await action(drop.persona.id, drop.toWorldId);
      if (res.ok) {
        toast.success(
          t(kind === "move" ? "moveSuccess" : "duplicateSuccess", {
            name: drop.persona.name ?? "Sans nom",
            world: drop.toWorldName ?? t("noWorld"),
          }),
        );
        router.refresh();
      } else {
        toast.error(res.error ?? tCommon("error"));
      }
      setPending(null);
    });
  }

  return (
    <div className="space-y-6">
      <Tabs value={view} onValueChange={(v) => setView(v as "worlds" | "alpha")}>
        <TabsList>
          <TabsTrigger value="worlds">{t("viewByWorld")}</TabsTrigger>
          <TabsTrigger value="alpha">{t("viewAlphabetical")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "alpha" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {alphabetical.personas.map((persona) => {
            const group = alphabetical.groupByKey.get(keyFor(persona.world_id));
            return (
              <div key={persona.id} className="space-y-1.5">
                <PersonaCardFor persona={persona} group={group} />
                <p className="text-xs text-muted-foreground truncate px-1">
                  {group?.worldName ?? t("noWorld")}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActivePersona(null)}
        >
          <div className="space-y-8">
            {displayGroups.map((group) => (
              <DroppableGroup
                key={keyFor(group.worldId)}
                groupKey={keyFor(group.worldId)}
              >
                <div className="flex items-center gap-2 mb-4">
                  {group.worldId ? (
                    <Link
                      href={`/w/${group.worldId}`}
                      className="text-base font-semibold hover:underline underline-offset-2"
                    >
                      {group.worldName}
                    </Link>
                  ) : (
                    <h2 className="text-base font-semibold text-muted-foreground">
                      {t("noWorld")}
                    </h2>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {personaLimit != null
                      ? `${group.personas.length} / ${personaLimit}`
                      : group.personas.length}
                  </span>
                </div>

                {group.personas.length === 0 ? (
                  <div className="grid place-items-center rounded-2xl border border-dashed border-border py-8 text-sm text-muted-foreground">
                    {t("dropHere")}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {group.personas.map((persona) => (
                      <DraggablePersona
                        key={persona.id}
                        persona={persona}
                        group={group}
                      />
                    ))}
                  </div>
                )}
              </DroppableGroup>
            ))}
          </div>

          {/* L'overlay reprend la taille mesurée de la carte d'origine :
              une réplique plein format suit le curseur, plus lisible pour
              viser la zone de dépôt. */}
          <DragOverlay dropAnimation={null}>
            {activePersona ? (
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted shadow-xl ring-2 ring-primary/50">
                {activePersona.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activePersona.avatar_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-3xl font-bold text-muted-foreground select-none">
                    {initials(activePersona.name ?? "Sans nom")}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <span className="text-sm font-semibold text-white leading-tight line-clamp-2 text-left">
                    {activePersona.name ?? "Sans nom"}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("dropTitle", { name: displayedDrop?.persona.name ?? "Sans nom" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("dropDescription", {
                name: displayedDrop?.persona.name ?? "Sans nom",
                world: displayedDrop?.toWorldName ?? t("noWorld"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <Button
              variant="outline"
              disabled={isSubmitting}
              onClick={() => confirmAction("duplicate")}
            >
              {t("duplicateAction")}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => confirmAction("move")}
            >
              {t("moveAction")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
