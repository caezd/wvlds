"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { StoredImage } from "@/components/ui/stored-image";
import { AVATAR_THUMB_SMALL } from "@/lib/storage";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";
import { cn, isSafeUrl } from "@/lib/utils";
import type { ChatMediaItem } from "@/types/db";

export function ImageLightbox({
  items,
  initialIndex,
  onClose,
}: {
  items: ChatMediaItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const tCommon = useTranslations("common");
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const item = items[current];

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex bg-black/40 backdrop-blur-sm pointer-events-auto"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      {/* Actions haut droite */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <a
          href={isSafeUrl(item.url) ? item.url : "#"}
          download={item.name}
          aria-label={tCommon("download")}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center size-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <Download className="size-4" />
        </a>
        <button
          aria-label={tCommon("close")}
          onClick={onClose}
          className="flex items-center justify-center size-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Image principale */}
      <div className="relative flex-1 p-16">
        {/* Chargement en deux temps : c'est ici que l'attente pèse le plus,
            une image de visionneuse arrivant en pleine résolution. La vignette
            floutée en tient la place — mêmes teintes, même composition. */}
        <StoredImage
          key={current}
          url={item.url}
          onClick={e => e.stopPropagation()}
          width={2048}
          sizes="100vw"
          className="rounded-xl object-contain select-none"
        />
      </div>

      {/* Miniatures — centrées verticalement à droite */}
      {items.length > 1 && (
        <div
          className="w-20 shrink-0 flex flex-col items-center justify-center gap-2 py-4 pr-4 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                "relative size-16 rounded-lg overflow-hidden shrink-0 border-2 transition-all",
                i === current ? "border-white" : "border-transparent opacity-50 hover:opacity-80",
              )}
            >
              {/* Carrée : la hauteur est demandée autant que la largeur,
                  sinon imgproxy garde le rapport d'origine. */}
              <StoredImage
                url={it.url}
                width={AVATAR_THUMB_SMALL}
                height={AVATAR_THUMB_SMALL}
                resize="cover"
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
