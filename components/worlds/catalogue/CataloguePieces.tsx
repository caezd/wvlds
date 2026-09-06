"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X, Pencil, Trash2, Loader2, Check, GripVertical, Copy,
} from "lucide-react";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { RARITY_COLORS } from "@/lib/worldCatalog";
import { CatalogVisual } from "./CatalogVisual";
import { RpgIconPicker } from "@/components/personas/RpgIconPicker";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { type CatalogType, type CatalogItem } from "./catalogueTypes";

// Briques élémentaires d'une ligne de catalogue.

// ── Icon display ──────────────────────────────────────────────────────────────

/** Le visuel d'un objet dans une ligne du catalogue. */
export function CatalogIcon({
  icon,
  lucideIcon,
  imageUrl,
  size = "md",
}: {
  icon?: string | null;
  lucideIcon?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md";
}) {
  return (
    <CatalogVisual
      icon={icon}
      lucideIcon={lucideIcon}
      imageUrl={imageUrl}
      size={size === "sm" ? 32 : 40}
    />
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

/** Ce que la saisie rapide transmet — le reste se règle dans le dialogue. */
export type AddItemData = {
  name: string;
  description: string;
  icon: string | null;
  lucide_icon: string | null;
  category_id: string | null;
};

/**
 * La saisie rapide, en ligne.
 *
 * Un nom, une icône, une description — de quoi entrer vingt objets à la suite
 * sans quitter le clavier. Tout le reste (rareté, image, propriétés) se règle
 * ensuite dans le dialogue de modification : le demander à la création
 * ralentirait le seul moment où l'on saisit en série.
 */
export function AddForm({
  type,
  categoryId,
  onAdd,
  onCancel,
}: {
  type: CatalogType;
  categoryId: string | null;
  onAdd: (data: AddItemData) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // `rpg_icons` est un jeu d'épées, de potions et de boucliers : il va aux
  // objets, et ne dit rien de « Diplomatie » ou de « Survie ». Les compétences
  // reçoivent donc le sélecteur Lucide. Le dialogue de modification, lui,
  // offre les trois sources dans les deux cas.
  const useLucide = type === "skills";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({
      name: name.trim(),
      description,
      icon: useLucide ? null : icon,
      lucide_icon: useLucide ? icon : null,
      category_id: categoryId,
    });
    setSaving(false);
    // Le formulaire reste ouvert, vidé, pour l'objet suivant : c'est la saisie
    // en série qu'il sert. On le referme par la croix, ou par Échap.
    setName("");
    setDescription("");
  }

  const trigger = (
    <button
      type="button"
      title={useLucide ? t("chooseLucideIcon") : t("chooseIcon")}
      aria-label={useLucide ? t("chooseLucideIcon") : t("chooseIcon")}
      className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors"
    >
      <CatalogVisual
        icon={useLucide ? null : icon}
        lucideIcon={useLucide ? icon : null}
        size={24}
        framed={false}
      />
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3 mt-1">
      {useLucide ? (
        <LucideIconPicker value={icon ?? ""} onChange={(name) => setIcon(name)} trigger={trigger} />
      ) : (
        <RpgIconPicker value={icon ?? undefined} onChange={(v) => setIcon(v ?? null)} trigger={trigger} />
      )}
      <div className="flex-1 space-y-1.5 min-w-0">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={type === "inventory" ? t("itemNamePlaceholder") : t("skillNamePlaceholder")}
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
          maxLength={200}
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

// ── Sortable item row ─────────────────────────────────────────────────────────

/**
 * Une ligne du catalogue.
 *
 * `canEdit` ouvre les commandes ; `canReorder` la poignée de déplacement. Les
 * deux sont distincts depuis la recherche : une liste filtrée ne montre plus
 * les voisins d'un objet, et l'y faire glisser reviendrait à réécrire des rangs
 * qu'on ne voit pas.
 */
export function SortableItemRow({
  item,
  canEdit,
  canReorder,
  usageCount,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenDetail,
}: {
  item: CatalogItem;
  canEdit: boolean;
  canReorder: boolean;
  usageCount?: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", categoryId: item.category_id },
    disabled: !canReorder,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/item flex items-center gap-2 px-2 py-1"
    >
      {canReorder && <DragHandle {...attributes} {...listeners} />}
      <CatalogIcon icon={item.icon} lucideIcon={item.lucide_icon} imageUrl={item.image_url} size="sm" />
      <button
        type="button"
        onClick={onOpenDetail}
        className="min-w-0 flex-1 rounded text-left transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {item.rarity && (
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
            />
          )}
          <span className="truncate text-sm font-medium leading-snug">{item.name}</span>
          {usageCount !== undefined && usageCount > 0 && (
            <span
              title={t("usageCount", { count: usageCount })}
              className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
            >
              {usageCount}
            </span>
          )}
        </span>
        {item.description && (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        )}
      </button>
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
            aria-label={t("duplicate")}
            type="button"
            onClick={onDuplicate}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
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
      <GripVertical className="h-4 w-5 shrink-0 text-muted-foreground/30" />
      <CatalogIcon icon={item.icon} lucideIcon={item.lucide_icon} imageUrl={item.image_url} />
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
