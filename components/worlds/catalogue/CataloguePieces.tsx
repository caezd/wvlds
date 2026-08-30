"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  X, Pencil, Trash2, ImageIcon, Loader2, Check, GripVertical,
} from "lucide-react";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { RpgIconPicker } from "@/components/personas/RpgIconPicker";
import { type CatalogType, type CatalogItem } from "./catalogueTypes";

// Briques élémentaires d'une ligne de catalogue.

// ── Icon display ──────────────────────────────────────────────────────────────

export function CatalogIcon({ icon, size = "md" }: { icon?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const img = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const px = size === "sm" ? 20 : 24;
  return (
    <div className={cn(dim, "shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40")}>
      {icon ? (
        <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={px} height={px} className={cn(img, "object-contain dark:invert")} />
      ) : (
        <ImageIcon className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", "text-muted-foreground/30")} />
      )}
    </div>
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

export function DragHandle(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

export function AddForm({
  type,
  categoryId,
  onAdd,
  onCancel,
}: {
  type: CatalogType;
  categoryId: string | null;
  onAdd: (data: { name: string; description: string; icon: string | undefined; category_id: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({ name: name.trim(), description, icon, category_id: categoryId });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3 mt-1">
      <RpgIconPicker
        value={icon}
        onChange={setIcon}
        trigger={
          <button type="button" title={t("chooseIcon")} className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors">
            {icon ? (
              <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </button>
        }
      />
      <div className="flex-1 space-y-1.5 min-w-0">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={type === "inventory" ? t("itemNamePlaceholder") : t("skillNamePlaceholder")}
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
          maxLength={80}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t("descPlaceholder")}
          className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          maxLength={200}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {t("add")}
        </button>
        <button
          aria-label={tCommon("cancel")}
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ── Edit row ──────────────────────────────────────────────────────────────────

export function EditRow({
  item,
  onSave,
  onCancel,
}: {
  item: CatalogItem;
  onSave: (data: { name: string; description: string | null; icon: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [icon, setIcon] = useState<string | undefined>(item.icon ?? undefined);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), description: description || null, icon: icon ?? null });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-xl border border-primary/30 bg-muted/20 px-3 py-2">
      <RpgIconPicker
        value={icon}
        onChange={setIcon}
        trigger={
          <button type="button" title={t("chooseIcon")} className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors">
            {icon ? (
              <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </button>
        }
      />
      <div className="flex-1 space-y-1 min-w-0">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-transparent text-sm font-medium outline-none"
          maxLength={80}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t("descPlaceholder")}
          className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          maxLength={200}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {tCommon("save")}
        </button>
        <button
          aria-label={tCommon("cancel")}
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

// ── Sortable item row ─────────────────────────────────────────────────────────

export function SortableItemRow({
  item,
  canEdit,
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onCancelEdit,
}: {
  item: CatalogItem;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (data: { name: string; description: string | null; icon: string | null }) => Promise<void>;
  onCancelEdit: () => void;
}) {
  const tCommon = useTranslations("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", categoryId: item.category_id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <EditRow item={item} onSave={onSave} onCancel={onCancelEdit} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/item flex items-center gap-2 px-2 py-1"
    >
      {canEdit && <DragHandle {...attributes} {...listeners} />}
      <CatalogIcon icon={item.icon} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button
            aria-label={tCommon("edit")}
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label={tCommon("delete")}
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Drag overlay renders ──────────────────────────────────────────────────────

export function ItemRowOverlay({ item }: { item: CatalogItem }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/95 px-2 py-2 shadow-xl backdrop-blur-sm">
      <GripVertical className="h-4 w-4 w-5 shrink-0 text-muted-foreground/30" />
      <CatalogIcon icon={item.icon} />
      <div className="flex-1 min-w-0 px-1">
        <p className="text-sm font-medium leading-snug">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
    </div>
  );
}

export function CategoryRowOverlay({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-1.5 shadow-xl backdrop-blur-sm">
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />
      <span className="text-sm font-semibold text-foreground/80">{name}</span>
    </div>
  );
}

