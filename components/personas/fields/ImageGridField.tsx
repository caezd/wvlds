"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Expand, Loader2, Plus, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toWebP } from "@/lib/imageUtils";
import { nomDeFichierPourType } from "@/lib/storagePaths";
import { ImageLightbox } from "@/components/chatrooms/ImageLightbox";
import type { PersonaGridImage } from "@/types/personas";

function GridImageThumb({ url }: { url: string }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <Image
      src={thumbFailed ? url : (supabaseThumb(url, 300) ?? url)}
      onError={() => setThumbFailed(true)}
      alt=""
      fill
      sizes="120px"
      className="object-cover"
      loading="lazy"
      draggable={false}
    />
  );
}

export function ImageGridField({
  fieldId,
  initialImages,
  personaId,
  userId,
  onSave,
}: {
  fieldId: string;
  initialImages: PersonaGridImage[];
  personaId: string;
  userId: string | null;
  onSave: (images: PersonaGridImage[]) => void;
}) {
  const tPersonas = useTranslations("personas");
  const supabase = createClient();
  const [images, setImages] = useState<PersonaGridImage[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !userId) return;
    setUploading(true);
    setUploadError(null);
    // En parallèle plutôt qu'en série : ajouter plusieurs images à une galerie
    // enchaînait autant de cycles compression + envoi. `toWebP` travaille dans
    // un web worker, et `Promise.all` conserve l'ordre de sélection.
    const settled = await Promise.all(
      Array.from(files).map(async (rawFile): Promise<PersonaGridImage | null> => {
        const file = await toWebP(rawFile);
        const path = `user-${userId}/section-images/${personaId}/${fieldId}/${nomDeFichierPourType(file.type)}`;
        const { error } = await supabase.storage.from("personas").upload(path, file, { upsert: false, contentType: file.type });
        if (error) return null;
        const { data } = supabase.storage.from("personas").getPublicUrl(path);
        return { id: path, url: data.publicUrl };
      }),
    );
    const added = settled.filter((img): img is PersonaGridImage => img !== null);
    if (added.length < settled.length) setUploadError("Certaines images n'ont pas pu être uploadées.");
    const next = [...images, ...added];
    setImages(next);
    onSave(next);
    setUploading(false);
  }

  function removeImage(id: string) {
    const next = images.filter((img) => img.id !== id);
    setImages(next);
    onSave(next);
  }

  return (
    <div className="space-y-2 pr-24">
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {lightboxIndex !== null && (
        <ImageLightbox
          items={images.map((img) => ({ url: img.url, name: img.caption ?? "Image" }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
        {images.map((img, i) => (
          <div key={img.id} className="group/img relative aspect-square overflow-hidden rounded-md bg-muted">
            <GridImageThumb url={img.url} />
            <div className="absolute inset-0 hidden group-hover/img:flex items-start justify-between p-1">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Agrandir"
              >
                <Expand className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
                aria-label={tPersonas("deleteImage")}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !userId}
          className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border-soft text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
          aria-label={tPersonas("addImages")}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
