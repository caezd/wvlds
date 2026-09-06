"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImageIcon, Loader2, Plus, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isStorableImage, toWebP } from "@/lib/imageUtils";
import { catalogItemImagePath } from "@/lib/storagePaths";
import { storagePathFromUrl } from "@/lib/storage";
import { CATALOG_RARITIES, MAX_CATALOG_PROPERTIES, RARITY_COLORS } from "@/lib/worldCatalog";
import type { WorldCatalogProperty, WorldCatalogRarity } from "@/types/worlds";
import type { CatalogItemInput } from "@/app/actions/worldCatalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RpgIconPicker } from "@/components/personas/RpgIconPicker";
import { CatalogIcon } from "./CataloguePieces";
import type { CatalogItem, CatalogType } from "./catalogueTypes";

// L'objet du catalogue, en grand.
//
// Il tenait sur une ligne : une icône, un nom, une description. La ligne ne
// pouvait plus porter la rareté, l'image, l'empilement et les propriétés
// libres sans devenir illisible — la modification passe donc par un dialogue,
// et la ligne garde ce qui se lit d'un coup d'œil. La saisie rapide, elle,
// reste en ligne : entrer vingt objets à la suite ne doit pas coûter vingt
// ouvertures de dialogue.

const MAX_ITEM_IMAGE_MB = 2;

/** Nom traduit d'une rareté — les clés suivent l'identifiant, en capitale. */
function rarityKey(rarity: WorldCatalogRarity): string {
  return `rarity${rarity.charAt(0).toUpperCase()}${rarity.slice(1)}`;
}

/** Pastille de couleur d'une rareté. */
export function RarityDot({ rarity, className }: { rarity: WorldCatalogRarity; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: RARITY_COLORS[rarity] }}
    />
  );
}

/** La rareté, nommée et colorée. */
export function RarityBadge({ rarity }: { rarity: WorldCatalogRarity }) {
  const t = useTranslations("catalogue");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: `${RARITY_COLORS[rarity]}66`, color: RARITY_COLORS[rarity] }}
    >
      <RarityDot rarity={rarity} />
      {t(rarityKey(rarity))}
    </span>
  );
}

// ── Éditeur ───────────────────────────────────────────────────────────────────

export function CatalogItemDialog({
  item,
  type,
  worldId,
  open,
  onOpenChange,
  onSave,
}: {
  item: CatalogItem;
  type: CatalogType;
  worldId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (id: string, data: CatalogItemInput) => Promise<void>;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [icon, setIcon] = useState<string | null>(item.icon ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(item.image_url ?? null);
  const [rarity, setRarity] = useState<WorldCatalogRarity | null>(item.rarity ?? null);
  const [stackable, setStackable] = useState(item.stackable !== false);
  const [maxQuantity, setMaxQuantity] = useState<string>(
    item.max_quantity ? String(item.max_quantity) : "",
  );
  const [properties, setProperties] = useState<WorldCatalogProperty[]>(item.properties ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Le dialogue reste monté d'une ouverture à l'autre : sans cela, modifier un
  // objet puis un autre montrerait les valeurs du premier.
  useEffect(() => {
    if (!open) return;
    setName(item.name);
    setDescription(item.description ?? "");
    setIcon(item.icon ?? null);
    setImageUrl(item.image_url ?? null);
    setRarity(item.rarity ?? null);
    setStackable(item.stackable !== false);
    setMaxQuantity(item.max_quantity ? String(item.max_quantity) : "");
    setProperties(item.properties ?? []);
  }, [open, item]);

  async function handleImagePick(file: File) {
    if (!isStorableImage(file)) {
      toast.error(tCommon("uploadImageError"));
      return;
    }
    if (file.size > MAX_ITEM_IMAGE_MB * 1024 * 1024) {
      toast.error(t("imageTooLarge", { max: MAX_ITEM_IMAGE_MB }));
      return;
    }
    setUploading(true);
    try {
      // 256 px suffisent : l'image ne s'affiche jamais plus grande qu'une
      // vignette, et un fichier de deux mégaoctets pour une case de 40 px
      // pèserait sur chaque chargement du catalogue.
      const converted = await toWebP(file, 256);
      const path = catalogItemImagePath(worldId, item.id, converted.type);
      const { error } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { contentType: converted.type });
      if (error) throw error;
      setImageUrl(supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl);
    } catch {
      toast.error(tCommon("uploadError"));
    } finally {
      setUploading(false);
    }
  }

  /**
   * Retire l'image, et efface le fichier.
   *
   * Le ménage est fait tout de suite plutôt qu'à l'enregistrement : chaque
   * envoi tire un nom neuf, l'ancien fichier n'est donc plus référencé dès que
   * l'état local l'oublie. Son échec est muet — la ligne, elle, sera bien
   * enregistrée sans image, et un fichier orphelin ne casse rien.
   */
  async function handleImageRemove() {
    const path = storagePathFromUrl(imageUrl, "worlds");
    setImageUrl(null);
    if (path) await supabase.storage.from("worlds").remove([path]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const parsedMax = maxQuantity.trim() ? Number(maxQuantity) : null;
    await onSave(item.id, {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      image_url: imageUrl,
      rarity,
      stackable,
      max_quantity: parsedMax && parsedMax > 0 ? Math.floor(parsedMax) : null,
      properties,
    });
    setSaving(false);
  }

  const canAddProperty = properties.length < MAX_CATALOG_PROPERTIES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{type === "inventory" ? t("editItem") : t("editSkill")}</DialogTitle>
          <DialogDescription className="sr-only">
            {type === "inventory" ? t("editItem") : t("editSkill")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Visuel + nom */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1.5">
              {imageUrl ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border-soft">
                  <Image src={imageUrl} alt="" fill unoptimized className="object-cover" />
                </div>
              ) : (
                <RpgIconPicker
                  value={icon ?? undefined}
                  onChange={(v) => setIcon(v ?? null)}
                  trigger={
                    <button
                      type="button"
                      title={t("chooseIcon")}
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-muted/40 transition-colors hover:bg-muted"
                    >
                      {icon ? (
                        <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={32} height={32} className="h-8 w-8 object-contain dark:invert" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                      )}
                    </button>
                  }
                />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleImagePick(file);
                }}
              />
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => void handleImageRemove()}
                  className="text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                >
                  {t("removeImage")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {t("useImage")}
                </button>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "inventory" ? t("itemNamePlaceholder") : t("skillNamePlaceholder")}
                className="w-full rounded-lg border border-border-soft bg-background px-3 py-2 text-sm font-medium outline-none focus:border-primary/40"
                maxLength={200}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descPlaceholder")}
                rows={3}
                className="w-full resize-y rounded-lg border border-border-soft bg-background px-3 py-2 text-xs outline-none focus:border-primary/40"
                maxLength={5000}
              />
            </div>
          </div>

          {/* Rareté, empilement, plafond */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("rarity")}</Label>
              <Select
                value={rarity ?? "none"}
                onValueChange={(v) => setRarity(v === "none" ? null : (v as WorldCatalogRarity))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("rarityNone")}</SelectItem>
                  {CATALOG_RARITIES.map((r) => (
                    <SelectItem key={r} value={r}>
                      <span className="flex items-center gap-2">
                        <RarityDot rarity={r} />
                        {t(rarityKey(r))}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Une compétence ne se compte pas : ni empilement ni plafond. */}
            {type === "inventory" && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor={`max-${item.id}`}>{t("maxQuantity")}</Label>
                <input
                  id={`max-${item.id}`}
                  type="number"
                  min={1}
                  value={maxQuantity}
                  disabled={!stackable}
                  onChange={(e) => setMaxQuantity(e.target.value)}
                  placeholder={t("noLimit")}
                  className="h-9 w-full rounded-lg border border-border-soft bg-background px-3 text-sm tabular-nums outline-none focus:border-primary/40 disabled:opacity-40"
                />
              </div>
            )}
          </div>

          {type === "inventory" && (
            <div className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2">
              <div className="min-w-0">
                <Label className="text-xs" htmlFor={`stack-${item.id}`}>{t("stackable")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("stackableHint")}</p>
              </div>
              <Switch id={`stack-${item.id}`} checked={stackable} onCheckedChange={setStackable} />
            </div>
          )}

          {/* Propriétés libres */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("properties")}</Label>
            <div className="space-y-1.5">
              {properties.map((property, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={property.label}
                    onChange={(e) =>
                      setProperties((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, label: e.target.value } : p)),
                      )
                    }
                    placeholder={t("propertyLabel")}
                    className="w-1/3 rounded-lg border border-border-soft bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/40"
                    maxLength={60}
                  />
                  <input
                    value={property.value}
                    onChange={(e) =>
                      setProperties((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, value: e.target.value } : p)),
                      )
                    }
                    placeholder={t("propertyValue")}
                    className="min-w-0 flex-1 rounded-lg border border-border-soft bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/40"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    aria-label={tCommon("remove")}
                    onClick={() => setProperties((prev) => prev.filter((_, i) => i !== index))}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {canAddProperty && (
                <button
                  type="button"
                  onClick={() => setProperties((prev) => [...prev, { label: "", value: "" }])}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("addProperty")}
                </button>
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {tCommon("save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Fiche en lecture ──────────────────────────────────────────────────────────

/**
 * Ce qu'un objet dit de lui, sans droit de modification.
 *
 * La ligne du catalogue tronque la description et tait les propriétés ; un
 * membre qui veut savoir ce que porte un objet n'avait nulle part où regarder.
 */
export function CatalogItemDetail({
  item,
  usageCount,
  open,
  onOpenChange,
}: {
  item: CatalogItem;
  usageCount?: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("catalogue");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <CatalogIcon icon={item.icon} imageUrl={item.image_url} />
            <div className="min-w-0 flex-1 space-y-1 text-left">
              <DialogTitle className="text-base">{item.name}</DialogTitle>
              {item.rarity && <RarityBadge rarity={item.rarity} />}
            </div>
          </div>
        </DialogHeader>

        <DialogDescription asChild>
          <div className="space-y-3">
            {item.description ? (
              <p className="whitespace-pre-line text-sm text-foreground/80">{item.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noDescription")}</p>
            )}

            {item.properties && item.properties.length > 0 && (
              <dl className="divide-y divide-border-soft rounded-lg border border-border-soft">
                {item.properties.map((property, index) => (
                  <div key={index} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                    <dt className="text-xs text-muted-foreground">{property.label}</dt>
                    <dd className="text-xs font-medium">{property.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.type === "inventory" && item.stackable === false && <span>{t("uniqueItem")}</span>}
              {item.type === "inventory" && item.max_quantity ? (
                <span>{t("maxQuantityValue", { count: item.max_quantity })}</span>
              ) : null}
              {usageCount !== undefined && <span>{t("usageCount", { count: usageCount })}</span>}
            </div>
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
