"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { ZoomIn, ZoomOut, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Utilitaire : découpe l'image sur canvas et retourne un Blob JPEG
// ---------------------------------------------------------------------------

export async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
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

function resolveCropHeight(aspect?: number): string {
  if (!aspect) return "16rem";
  if (aspect > 1.2) return "20rem";
  return "16rem";
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
        <Button variant="outline" size="sm" onClick={onCancel} disabled={uploading}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Autre image
        </Button>
        <Button
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
