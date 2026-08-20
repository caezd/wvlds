"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlignCenter, AlignLeft, ImagePlus, Loader2, Palette, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HsvColorPicker, ACCENT_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { cn } from "@/lib/utils";
import {
  MAX_HOME_BANNER_TEXT_LENGTH,
  MAX_HOME_BLOCK_TITLE_LENGTH,
  type WorldHomeBannerAlign,
  type WorldHomeBannerContent,
} from "../worldHomeGrid";

const DEFAULT_ACCENT = "#9aa0a6";

/**
 * Rendu du bloc bannière — partagé par la page d'accueil (WorldHomeGridView)
 * et l'aperçu live du dialogue d'édition ci-dessous, comme CalloutBlockView
 * pour les encadrés de chatroom (components/chatrooms/blocks/CalloutBlock.tsx).
 */
export function WorldHomeBannerView({ banner }: { banner: WorldHomeBannerContent }) {
  const align: WorldHomeBannerAlign = banner.align ?? "left";
  const hasImage = !!banner.image;
  const hasButton = !!banner.buttonLabel && !!banner.buttonUrl;
  // Le dégradé n'assombrit l'image que pour garder le texte lisible par-dessus
  // — une bannière purement visuelle (sans titre ni texte) n'en a pas besoin.
  const hasText = !!banner.title || !!banner.text;

  return (
    <div
      className={cn(
        // `h-full` : épouse la hauteur de la ligne de la grille (le plus haut
        // bloc voisin), au lieu de rester cantonnée à sa propre hauteur de
        // contenu — `min-h` ne sert alors que de plancher pour une bannière
        // seule sur sa ligne.
        // `rounded-lg` : même rayon que les autres cartes de la grille (bloc
        // html/markdown en carte, salons, catégories…), pour rester cohérent.
        "relative flex h-full min-h-[180px] w-full flex-col justify-center overflow-hidden rounded-lg p-6",
        !hasImage && "border border-border-soft bg-muted/30",
        align === "center" ? "items-center text-center" : "items-start text-left",
      )}
      style={
        hasImage
          ? { backgroundImage: `url(${banner.image})`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined
      }
    >
      {hasImage && hasText && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden />
      )}
      <div className="relative z-10 max-w-xl space-y-2">
        {banner.title && (
          <h3 className={cn("text-xl font-bold", hasImage ? "text-white" : "text-foreground")}>{banner.title}</h3>
        )}
        {banner.text && (
          <p className={cn("text-sm leading-relaxed", hasImage ? "text-white/85" : "text-muted-foreground")}>
            {banner.text}
          </p>
        )}
        {hasButton && (
          <a
            href={banner.buttonUrl}
            target={banner.buttonUrl!.startsWith("/") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={cn(
              "mt-2 inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition-transform hover:scale-[1.02]",
              !banner.accent && "bg-primary hover:bg-primary/90",
            )}
            style={banner.accent ? { backgroundColor: banner.accent } : undefined}
          >
            {banner.buttonLabel}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Édition d'un bloc bannière — inspirée du modal des encadrés de chatroom
 * (CalloutDialog dans components/chatrooms/blocks/CalloutBlock.tsx) : aperçu
 * live fixe à gauche, formulaire scrollable à droite. Ne persiste rien
 * elle-même : rend son résultat via `onSave`, à l'éditeur de grille parent
 * (voir WorldHomeGridEditor.tsx).
 */
export function WorldHomeBannerDialog({
  open,
  onOpenChange,
  initialBanner,
  onSave,
  onUploadImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBanner?: WorldHomeBannerContent;
  onSave: (banner: WorldHomeBannerContent) => void;
  onUploadImage?: (file: File) => Promise<string | null>;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");

  const [title, setTitle] = React.useState(initialBanner?.title ?? "");
  const [text, setText] = React.useState(initialBanner?.text ?? "");
  const [image, setImage] = React.useState(initialBanner?.image ?? "");
  const [imageUploading, setImageUploading] = React.useState(false);
  const imageFileInputRef = React.useRef<HTMLInputElement>(null);
  const [accent, setAccent] = React.useState(initialBanner?.accent ?? "");
  const [align, setAlign] = React.useState<WorldHomeBannerAlign>(initialBanner?.align ?? "left");
  const [buttonLabel, setButtonLabel] = React.useState(initialBanner?.buttonLabel ?? "");
  const [buttonUrl, setButtonUrl] = React.useState(initialBanner?.buttonUrl ?? "");

  React.useEffect(() => {
    if (!open) return;
    setTitle(initialBanner?.title ?? "");
    setText(initialBanner?.text ?? "");
    setImage(initialBanner?.image ?? "");
    setAccent(initialBanner?.accent ?? "");
    setAlign(initialBanner?.align ?? "left");
    setButtonLabel(initialBanner?.buttonLabel ?? "");
    setButtonUrl(initialBanner?.buttonUrl ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isValid = !!(title.trim() || text.trim() || image);

  function handleSave() {
    if (!isValid) return;
    const banner: WorldHomeBannerContent = {};
    if (title.trim()) banner.title = title.trim();
    if (text.trim()) banner.text = text.trim();
    if (image) banner.image = image;
    if (accent) banner.accent = accent;
    if (align === "center") banner.align = "center";
    if (buttonLabel.trim() && buttonUrl.trim()) {
      banner.buttonLabel = buttonLabel.trim();
      banner.buttonUrl = buttonUrl.trim();
    }
    onSave(banner);
    onOpenChange(false);
  }

  const previewBanner: WorldHomeBannerContent = {
    title: title.trim() || undefined,
    text: text.trim() || undefined,
    image: image || undefined,
    accent: accent || undefined,
    align,
    ...(buttonLabel.trim() && buttonUrl.trim()
      ? { buttonLabel: buttonLabel.trim(), buttonUrl: buttonUrl.trim() }
      : {}),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[75vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{t("home.grid.bannerDialogTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border-t border-border-soft">
          {/* Aperçu live — fixe à gauche */}
          <div className="flex flex-col gap-2 border-b border-border-soft bg-background/40 p-5 sm:border-b-0 sm:border-r">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              {t("home.announcement.previewLabel")}
            </Label>
            <div className="flex flex-1 items-center">
              <WorldHomeBannerView banner={previewBanner} />
            </div>
          </div>

          {/* Formulaire — scrolle à droite */}
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="home-block-banner-title" className="text-xs text-muted-foreground">
                  {t("home.grid.bannerTitleLabel")}
                </Label>
                <Input
                  id="home-block-banner-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("home.grid.bannerTitlePlaceholder")}
                  maxLength={MAX_HOME_BLOCK_TITLE_LENGTH}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="home-block-banner-text" className="text-xs text-muted-foreground">
                  {t("home.grid.bannerTextLabel")}
                </Label>
                <Textarea
                  id="home-block-banner-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("home.grid.bannerTextPlaceholder")}
                  rows={3}
                  className="resize-none"
                  maxLength={MAX_HOME_BANNER_TEXT_LENGTH}
                />
              </div>

              {/* Image de fond */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("home.grid.bannerImageLabel")}</Label>
                  {image && (
                    <button
                      type="button"
                      onClick={() => setImage("")}
                      className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("home.grid.bannerImageRemove")}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={imageUploading || !onUploadImage}
                  onClick={() => onUploadImage && imageFileInputRef.current?.click()}
                  title={!onUploadImage ? t("home.grid.bannerImageDisabled") : undefined}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors",
                    onUploadImage && !imageUploading ? "hover:bg-muted" : "cursor-not-allowed opacity-40",
                    image && "border-primary/50 bg-primary/10",
                  )}
                >
                  {imageUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                  ) : image ? (
                    <Image src={image} alt="" width={20} height={20} className="h-5 w-5 rounded-sm object-cover shrink-0" />
                  ) : (
                    <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("flex-1 truncate text-left text-sm", !image && "text-muted-foreground")}>
                    {image ? t("home.grid.bannerImageChange") : t("home.grid.bannerImageUpload")}
                  </span>
                </button>
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !onUploadImage) return;
                    setImageUploading(true);
                    const url = await onUploadImage(file);
                    setImageUploading(false);
                    if (url) setImage(url);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Couleur d'accent */}
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">{t("home.grid.bannerAccentLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 hover:border-foreground/40 transition-colors"
                    >
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      <span
                        className="h-3 w-3 rounded-full border border-border/40"
                        style={{ backgroundColor: accent || DEFAULT_ACCENT }}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-3 z-[200]" align="start">
                    <HsvColorPicker color={accent || DEFAULT_ACCENT} onChange={setAccent} presets={[]} />
                  </PopoverContent>
                </Popover>
                {ACCENT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setAccent(c.value)}
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-sm border border-border/40 hover:ring-1 hover:ring-ring transition-shadow",
                      accent === c.value && "ring-2 ring-ring",
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setAccent("")}
                  className={cn(
                    "ml-auto shrink-0 rounded-md border px-2 py-0.5 text-xs transition-colors",
                    accent === "" ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("home.grid.bannerAccentNone")}
                </button>
              </div>

              {/* Alignement */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("home.grid.bannerAlignLabel")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "left" as const, labelKey: "home.grid.bannerAlignLeft", Icon: AlignLeft },
                    { value: "center" as const, labelKey: "home.grid.bannerAlignCenter", Icon: AlignCenter },
                  ]).map(({ value, labelKey, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAlign(value)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-all",
                        align === value
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bouton d'action */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("home.grid.bannerButtonLabel")}</Label>
                  {(buttonLabel || buttonUrl) && (
                    <button
                      type="button"
                      onClick={() => { setButtonLabel(""); setButtonUrl(""); }}
                      className="flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> {t("home.grid.bannerButtonClear")}
                    </button>
                  )}
                </div>
                <Input
                  value={buttonLabel}
                  onChange={(e) => setButtonLabel(e.target.value)}
                  placeholder={t("home.grid.bannerButtonLabelPlaceholder")}
                  maxLength={MAX_HOME_BLOCK_TITLE_LENGTH}
                />
                <Input
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder={t("home.grid.bannerButtonUrlPlaceholder")}
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="border-t border-border-soft px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {initialBanner ? tCommon("save") : tCommon("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
