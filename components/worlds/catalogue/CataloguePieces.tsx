"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X, Pencil, Trash2, Loader2, Check, GripVertical, Copy, MoreHorizontal, FolderInput, Swords, Shapes,
} from "lucide-react";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { RARITY_COLORS } from "@/lib/worldCatalog";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { CatalogVisual, visualSourceButtonClass } from "./CatalogVisual";
import { useCatalogueRow } from "./CatalogueRowContext";
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
  const [lucideIcon, setLucideIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({
      name: name.trim(),
      description,
      icon,
      lucide_icon: lucideIcon,
      category_id: categoryId,
    });
    setSaving(false);
    // Le formulaire reste ouvert, vidé, pour l'objet suivant : c'est la saisie
    // en série qu'il sert. On le referme par la croix, ou par Échap.
    setName("");
    setDescription("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3 mt-1">
      {/* Les deux sources d'icône, comme dans le dialogue — l'image, elle,
          attend que l'objet existe pour avoir un dossier. Un jeu d'épées et de
          potions va aux objets, les icônes de l'application aux compétences,
          mais aucun des deux n'est réservé : « Forge » se dessine mieux avec
          une enclume de jeu, « Potion de soin » avec un cœur. Choisir l'une
          efface l'autre, pour que le visuel affiché soit toujours celui qu'on
          vient de choisir. */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <CatalogVisual icon={icon} lucideIcon={lucideIcon} size={40} />
        <div className="flex items-center gap-0.5">
          <RpgIconPicker
            value={icon ?? undefined}
            onChange={(v) => { setIcon(v ?? null); setLucideIcon(null); }}
            trigger={
              <button
                type="button"
                title={t("chooseIcon")}
                aria-label={t("chooseIcon")}
                className={visualSourceButtonClass(!!icon)}
              >
                <Swords className="h-3.5 w-3.5" />
              </button>
            }
          />
          <LucideIconPicker
            value={lucideIcon ?? ""}
            onChange={(name) => { setLucideIcon(name); setIcon(null); }}
            trigger={
              <button
                type="button"
                title={t("chooseLucideIcon")}
                aria-label={t("chooseLucideIcon")}
                className={visualSourceButtonClass(!!lucideIcon)}
              >
                <Shapes className="h-3.5 w-3.5" />
              </button>
            }
          />
        </div>
      </div>
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
 *
 * Les commandes tiennent dans un menu « ⋯ », et non en trois icônes révélées
 * au survol : le survol n'existe pas au doigt, et « Supprimer » y était collé
 * à « Modifier ». Le menu porte aussi « Déplacer vers… » — classer un objet
 * sans le glisser, ce qui reste possible quand une recherche a suspendu le
 * glisser-déposer. La case à cocher, elle, ouvre la sélection multiple.
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
  const { categories, onMoveItem, selectedIds, onToggleSelected } = useCatalogueRow();
  const selected = selectedIds.has(item.id);
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
      data-selected={selected || undefined}
      className={cn(
        "group/item flex items-center gap-2 rounded-lg px-2 py-1 transition-colors",
        selected && "bg-primary/5",
      )}
    >
      {canReorder && <DragHandle {...attributes} {...listeners} />}
      {canEdit && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(item.id)}
          aria-label={t("selectItem", { name: item.name })}
          className={cn(
            "shrink-0 transition-opacity",
            !selected && "opacity-40 group-hover/item:opacity-100 focus-visible:opacity-100",
          )}
        />
      )}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("itemActions", { name: item.name })}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-opacity hover:bg-secondary hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover/item:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {/* `afterMenuClose` : la modification ouvre un dialogue, une seconde
                couche modale par-dessus le menu qui se ferme. */}
            <DropdownMenuItem onSelect={afterMenuClose(onEdit)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> {tCommon("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="mr-2 h-3.5 w-3.5" /> {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 h-3.5 w-3.5" /> {t("moveTo")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                {categories.map((cat) => (
                  <DropdownMenuItem
                    key={cat.id}
                    disabled={cat.id === item.category_id}
                    onSelect={() => onMoveItem(item.id, cat.id)}
                  >
                    {cat.name}
                  </DropdownMenuItem>
                ))}
                {categories.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={item.category_id === null}
                  onSelect={() => onMoveItem(item.id, null)}
                >
                  {t("uncategorized")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
