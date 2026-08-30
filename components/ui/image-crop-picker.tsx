"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Area, CropperProps } from "react-easy-crop";
import { ZoomIn, ZoomOut, RotateCcw, Loader2, ImagePlus, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// Le recadreur n'est monté qu'à l'ouverture d'un dialogue d'ajout d'image, mais
// l'import statique le plaçait dans le bundle de tout écran qui importe ce
// fichier — dont le composer, donc chaque salon. Même motif que
// `emoji-picker-react` (cf. ChatReactionPicker / EmojiPickerButton).
// `CropperProps` déclare obligatoires une douzaine de props (aspect, rotation,
// minZoom, cropShape…) que la librairie remplit en réalité via ses
// `defaultProps` — un détail que `dynamic()` n'expose plus au typage. D'où ce
// cast : seules les props sans défaut restent requises. Sans effet à
// l'exécution (React applique toujours les defaultProps sur `undefined`).
const Cropper = dynamic(() => import("react-easy-crop"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted/30" />,
}) as React.ComponentType<
  Partial<CropperProps> & Pick<CropperProps, "image" | "crop" | "zoom" | "onCropChange">
>;

// ---------------------------------------------------------------------------
// Utilitaire : découpe l'image sur canvas et retourne un Blob JPEG
//
// Les sources distantes (lien externe) sont chargées avec crossOrigin pour
// pouvoir être lues par le canvas ; ça échoue si l'hébergeur ne renvoie pas
// les en-têtes CORS adéquats (canvas "tainted" → toBlob renvoie null).
// ---------------------------------------------------------------------------

export async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!imageSrc.startsWith("blob:") && !imageSrc.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height,
      );
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("toBlob failed")); },
        "image/jpeg", 0.92,
      );
    });
    image.addEventListener("error", () => reject(new Error("Impossible de charger l'image.")));
    image.src = imageSrc;
  });
}

// ---------------------------------------------------------------------------
// Helpers : objectFit et hauteur selon le ratio
// ---------------------------------------------------------------------------

function resolveObjectFit(aspect?: number): "horizontal-cover" | "vertical-cover" | "contain" {
  if (!aspect) return "contain";
  if (aspect > 1.2) return "horizontal-cover";
  if (aspect < 0.8) return "vertical-cover";
  return "contain";
}

// clamp() plutôt qu'une hauteur fixe — sur mobile la zone de recadrage suit
// la largeur réelle de l'écran (proche de 100vw) au lieu d'imposer 320px de
// haut sur un conteneur qui peut faire moins de 350px de large.
function resolveCropHeight(aspect?: number): string {
  if (!aspect) return "clamp(10rem, 60vw, 16rem)";
  if (aspect > 1.2) return "clamp(10rem, 60vw, 20rem)";
  return "clamp(10rem, 60vw, 16rem)";
}

// ---------------------------------------------------------------------------
// ImageCropPicker
//
// Props:
//   src        — URL blob de l'image à recadrer
//   aspect     — ratio largeur/hauteur désiré (ex: 1 pour carré, 768/112 pour bannière)
//   uploading  — true pendant que le parent uploade
//   onConfirm  — appelé avec les pixels recadrés ; le parent gère l'upload
//   onCancel   — l'utilisateur veut choisir une autre image
// ---------------------------------------------------------------------------

export function ImageCropPicker({
  src,
  aspect,
  uploading = false,
  onConfirm,
  onCancel,
}: {
  src: string;
  aspect?: number;
  uploading?: boolean;
  onConfirm: (croppedAreaPixels: Area) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const objectFit = resolveObjectFit(aspect);
  const height = resolveCropHeight(aspect);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Déplacez et zoomez pour recadrer l&apos;image.
      </p>

      <div
        className="relative mx-auto w-[95%] rounded-lg overflow-hidden bg-black"
        style={{ height }}
        data-base-ui-swipe-ignore=""
      >
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          objectFit={objectFit}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="flex items-center gap-2">
        <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={1} max={3} step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={uploading}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Autre image
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={uploading || !croppedAreaPixels}
          onClick={() => croppedAreaPixels && onConfirm(croppedAreaPixels)}
        >
          {uploading
            ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Upload…</>
            : "Recadrer & enregistrer"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageSourceStep — sélection de la source d'une image, avant recadrage :
// fichier (clic/glisser-déposer/coller depuis le presse-papiers) ou lien
// externe (URL collée, aussi acceptée directement en Ctrl+V sur la zone).
// ---------------------------------------------------------------------------

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function checkImageLoads(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image introuvable ou inaccessible."));
    img.src = src;
  });
}

export function ImageSourceStep({
  onSelect,
  disabled = false,
}: {
  /** Appelé avec une URL utilisable comme `src` (blob local ou lien externe validé). */
  onSelect: (src: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Seules les images sont acceptées."); return; }
    setError(null);
    onSelect(URL.createObjectURL(file));
  }

  async function selectUrl(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!isHttpUrl(trimmed)) { setError("Lien invalide (doit commencer par http:// ou https://)."); return; }
    setChecking(true);
    setError(null);
    try {
      await checkImageLoads(trimmed);
      onSelect(trimmed);
    } catch {
      setError("Impossible de charger cette image depuis ce lien.");
    } finally {
      setChecking(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (disabled) return;
    const fileItem = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (fileItem) {
      e.preventDefault();
      selectFile(fileItem.getAsFile());
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text && isHttpUrl(text)) {
      e.preventDefault();
      setUrl(text.trim());
      void selectUrl(text);
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!disabled) selectFile(e.dataTransfer.files?.[0]); }}
        onPaste={handlePaste}
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-5 text-center transition-colors sm:px-6 sm:py-8",
          disabled ? "opacity-50" : "cursor-pointer hover:border-muted-foreground/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { selectFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        <ImagePlus className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs font-medium">
          Glissez-déposez ou collez (Ctrl+V) une image, ou{" "}
          <span className="text-blue-400">{t("clickToPickFile")}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">Taille max 5 Mo</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="…ou collez un lien d'image (https://…)"
            value={url}
            disabled={disabled || checking}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void selectUrl(url); }}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={disabled || checking || !url.trim()} onClick={() => void selectUrl(url)}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Utiliser"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImagePickerCropField — composant standard réutilisé partout dans l'app pour
// choisir puis recadrer une image (avatar, bannière, icône…).
//
// Combine ImageSourceStep (choix : fichier / glisser-déposer / presse-papiers
// / lien externe) et ImageCropPicker (recadrage). Le parent ne reçoit que le
// Blob final déjà recadré et gère lui-même la conversion/upload.
// ---------------------------------------------------------------------------

export function ImagePickerCropField({
  aspect,
  uploading = false,
  onConfirm,
  previewSrc,
  previewAlt = "",
  previewClassName,
  changeLabel = "Changer l'image",
}: {
  aspect?: number;
  uploading?: boolean;
  /** Reçoit le Blob JPEG déjà recadré ; au parent de convertir/uploader. */
  onConfirm: (blob: Blob) => void | Promise<void>;
  /** Image actuellement enregistrée, affichée en aperçu cliquable pour la remplacer. */
  previewSrc?: string | null;
  previewAlt?: string;
  previewClassName?: string;
  changeLabel?: string;
}) {
  const [picking, setPicking] = useState(!previewSrc);
  const [src, setSrc] = useState<string | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);

  // Si l'image affichée disparaît (suppression côté parent) alors qu'on est
  // en mode aperçu, on repasse automatiquement en sélection.
  useEffect(() => {
    if (!previewSrc) setPicking(true);
  }, [previewSrc]);

  function resetSrc() {
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    setSrc(null);
    setCropError(null);
  }

  function cancelPicking() {
    resetSrc();
    setPicking(false);
  }

  async function handleCropConfirm(pixels: Area) {
    if (!src) return;
    try {
      const blob = await getCroppedImg(src, pixels);
      await onConfirm(blob);
      const wasBlob = src.startsWith("blob:");
      setSrc(null);
      setPicking(false);
      if (wasBlob) URL.revokeObjectURL(src);
    } catch {
      setCropError("Impossible de recadrer cette image (le serveur distant bloque probablement l'accès). Essayez de la télécharger puis de l'importer comme fichier.");
    }
  }

  if (picking) {
    if (src) {
      return (
        <div className="space-y-2">
          <ImageCropPicker
            src={src}
            aspect={aspect}
            uploading={uploading}
            onConfirm={handleCropConfirm}
            onCancel={resetSrc}
          />
          {cropError && <p className="text-xs text-destructive">{cropError}</p>}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <ImageSourceStep onSelect={setSrc} disabled={uploading} />
        {previewSrc && (
          <button
            type="button"
            onClick={cancelPicking}
            disabled={uploading}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Annuler
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPicking(true)}
      disabled={uploading}
      className={cn("group relative block overflow-hidden focus-visible:outline-none", previewClassName)}
    >
      {/* previewSrc peut être un blob:/data: URI (aperçu local avant upload) ou un lien externe
          arbitraire (recadrage depuis une URL) — aucun des deux n'est compatible avec next/image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewSrc ?? undefined} alt={previewAlt} className="h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100 focus-within:opacity-100">
        {uploading
          ? <Loader2 className="h-5 w-5 animate-spin text-white" />
          : <span className="text-xs font-medium text-white">{changeLabel}</span>
        }
      </div>
    </button>
  );
}
