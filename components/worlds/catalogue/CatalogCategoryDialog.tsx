"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";
import { catalogCategoryBannerPath } from "@/lib/storagePaths";
import { storagePathFromUrl } from "@/lib/storage";
import { messageErreurAction } from "@/lib/actionErrors";
import { updateWorldCatalogCategory } from "@/app/actions/worldCatalog";
import type { WorldCatalogCategory } from "@/types/worlds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";

/**
 * Présentation d'une catégorie du catalogue (migration 185) : son nom, une
 * description en Markdown et une bannière — tout ce qui s'affiche en tête
 * quand on la déplie. La bannière vit dans le bucket `worlds`, sous
 * `world-<id>/category-<id>/`, comme les images d'objets.
 */
export function CatalogCategoryDialog({
  category,
  open,
  onOpenChange,
  onSaved,
}: {
  category: WorldCatalogCategory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: WorldCatalogCategory) => void;
}) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [bannerUrl, setBannerUrl] = useState(category.banner_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleBanner(blob: Blob) {
    setUploading(true);
    try {
      const converted = await toWebP(new File([blob], "banner.png", { type: blob.type || "image/png" }), 1200);
      const path = catalogCategoryBannerPath(category.world_id, category.id, converted.type);
      const { error } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { upsert: true, contentType: converted.type });
      if (error) throw error;
      // Un cache-buster : le chemin ne change pas d'un envoi à l'autre.
      setBannerUrl(`${supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`);
    } catch (e) {
      // Jamais `e.message` : Postgrest y met le message brut de la politique.
      console.error("[CatalogCategoryDialog] envoi de la bannière", e);
      toast.error(tCommon("uploadError"));
      throw e;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || uploading) return;
    setSaving(true);
    const data = { name: trimmed, description: description.trim() || null, banner_url: bannerUrl || null };
    const res = await updateWorldCatalogCategory(category.id, data);
    setSaving(false);
    if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
    // La bannière retirée : son fichier part avec, une fois la ligne enregistrée.
    if (category.banner_url && !bannerUrl) {
      const path = storagePathFromUrl(category.banner_url, "worlds");
      if (path) await supabase.storage.from("worlds").remove([path]);
    }
    onSaved({ ...category, ...data });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("categoryDialogTitle")}</DialogTitle>
          <DialogDescription>{t("categoryDialogHelp")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("categoryBanner")}</Label>
            <ImagePickerCropField
              aspect={3}
              uploading={uploading}
              previewSrc={bannerUrl || null}
              previewClassName="aspect-[3/1] w-full rounded-lg"
              changeLabel={tCommon("dropToReplace")}
              onConfirm={handleBanner}
            />
            {bannerUrl && (
              <button
                type="button"
                onClick={() => setBannerUrl("")}
                disabled={uploading}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {t("removeImage")}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="catalog-category-name">{t("categoryName")}</Label>
            <Input
              id="catalog-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("categoryNamePlaceholder")}
              maxLength={60}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="catalog-category-description">{t("categoryDescription")}</Label>
            <Textarea
              id="catalog-category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("categoryDescriptionPlaceholder")}
              rows={4}
              maxLength={5000}
              className="rounded-lg"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
            <Button type="submit" disabled={!name.trim() || saving || uploading}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
