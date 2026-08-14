"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";
import { toast } from "sonner";
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
import { GripVertical, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { CategoryAvatar } from "@/components/worlds/catalogue/CategoryAvatar";
import {
  addChatroomCategory,
  updateChatroomCategory,
  deleteChatroomCategory,
  reorderChatroomCategories,
} from "@/app/actions/chatroomCategories";
import type { ChatroomCategory } from "@/types/worlds";

async function uploadCategoryImage(
  supabase: ReturnType<typeof createClient>,
  worldId: string,
  file: File,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 5 Mo).");

  const converted = await toWebP(file);
  const path = `world-${worldId}/category-image-${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from("chatroom-categories")
    .upload(path, converted, { upsert: true, contentType: converted.type });
  if (error) throw error;

  return supabase.storage.from("chatroom-categories").getPublicUrl(path).data.publicUrl;
}

function CategoryForm({
  worldId,
  initial,
  onCancel,
  onSaved,
}: {
  worldId: string;
  initial?: ChatroomCategory;
  onCancel: () => void;
  onSaved: (category: ChatroomCategory) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  // Une seule image sert à la fois de bannière (grande carte) et d'icône
  // (petits avatars) — plus de champs séparés à gérer côté admin.
  const [imageUrl, setImageUrl] = React.useState(initial?.banner_url ?? initial?.icon_url ?? "");
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function handleImageConfirm(blob: Blob) {
    setUploadingImage(true);
    try {
      const url = await uploadCategoryImage(
        supabase,
        worldId,
        new File([blob], "category.jpg", { type: blob.type || "image/jpeg" }),
      );
      setImageUrl(url ?? "");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Téléversement impossible.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    // Un upload d'image en cours n'a pas encore mis à jour imageUrl —
    // enregistrer maintenant sauvegarderait silencieusement l'ancienne image.
    if (uploadingImage) {
      toast.error("Attends la fin du téléversement de l'image avant d'enregistrer.");
      return;
    }
    setSaving(true);
    const data = {
      title: trimmed,
      description: description.trim() || null,
      banner_url: imageUrl || null,
      icon_url: imageUrl || null,
    };
    if (initial) {
      const res = await updateChatroomCategory(initial.id, data);
      setSaving(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onSaved({ ...initial, ...data });
    } else {
      const res = await addChatroomCategory(worldId, data);
      setSaving(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onSaved(res.category);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-3 rounded-xl border border-border-soft bg-muted/20 p-3"
    >
      <div className="space-y-1.5">
        <ImagePickerCropField
          aspect={4 / 3}
          uploading={uploadingImage}
          previewSrc={imageUrl || null}
          previewClassName="aspect-[4/3] w-full rounded-lg"
          changeLabel="Cliquer ou déposer pour remplacer"
          onConfirm={handleImageConfirm}
        />
        {imageUrl && (
          <button
            type="button"
            onClick={() => setImageUrl("")}
            disabled={uploadingImage}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Retirer l&apos;image
          </button>
        )}
      </div>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nom de la catégorie"
        maxLength={60}
      />
      <Textarea
        value={description ?? ""}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optionnel)"
        rows={2}
        className="rounded-lg"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={!title.trim() || saving || uploadingImage}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {initial ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </form>
  );
}

function CategoryRow({
  category,
  canEdit,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaved,
  onDelete,
}: {
  category: ChatroomCategory;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (category: ChatroomCategory) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !canEdit,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <CategoryForm
          worldId={category.world_id}
          initial={category}
          onCancel={onCancelEdit}
          onSaved={onSaved}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/40"
    >
      {canEdit && (
        <span
          {...attributes}
          {...listeners}
          className="shrink-0 touch-none cursor-grab text-muted-foreground/50"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <CategoryAvatar
        title={category.title}
        bannerUrl={category.banner_url}
        iconUrl={category.icon_url}
        className="h-8 w-8 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{category.title}</p>
        {category.description && (
          <p className="truncate text-xs text-muted-foreground">{category.description}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <DeleteConfirmDialog
            description={`Supprimer « ${category.title} » ? Les chatrooms de cette catégorie repasseront dans « Général ».`}
            onConfirm={onDelete}
            trigger={
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

export function WorldCategoryManager({
  worldId,
  canEdit,
}: {
  worldId: string;
  canEdit: boolean;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [categories, setCategories] = React.useState<ChatroomCategory[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  React.useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("chatroom_categories")
        .select("id, world_id, title, description, banner_url, icon_url, position")
        .eq("world_id", worldId)
        .order("position", { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      setCategories(data as ChatroomCategory[]);
    })();
  }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreated(category: ChatroomCategory) {
    setCategories((prev) => [...(prev ?? []), category]);
    setCreating(false);
    router.refresh();
  }

  function handleUpdated(category: ChatroomCategory) {
    setCategories((prev) => prev?.map((c) => (c.id === category.id ? category : c)) ?? null);
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(category: ChatroomCategory) {
    const res = await deleteChatroomCategory(category.id, category.banner_url, category.icon_url);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCategories((prev) => prev?.filter((c) => c.id !== category.id) ?? null);
    router.refresh();
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !categories) return;
    const oldIdx = categories.findIndex((c) => c.id === active.id);
    const newIdx = categories.findIndex((c) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const previous = categories;
    const reordered = arrayMove(categories, oldIdx, newIdx).map((c, i) => ({ ...c, position: i }));
    setCategories(reordered);

    void (async () => {
      const res = await reorderChatroomCategories(reordered.map((c) => ({ id: c.id, position: c.position })));
      if (!res.ok) {
        toast.error(res.error);
        setCategories(previous);
        return;
      }
      router.refresh();
    })();
  }

  if (categories === null) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                canEdit={canEdit}
                isEditing={editingId === category.id}
                onEdit={() => setEditingId(category.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaved={handleUpdated}
                onDelete={() => void handleDelete(category)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {categories.length === 0 && !creating && (
        <p className="px-2 py-1 text-xs text-muted-foreground/60">
          Aucune catégorie pour l&apos;instant.
        </p>
      )}

      {canEdit &&
        (creating ? (
          <CategoryForm worldId={worldId} onCancel={() => setCreating(false)} onSaved={handleCreated} />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouvelle catégorie
          </button>
        ))}
    </div>
  );
}
