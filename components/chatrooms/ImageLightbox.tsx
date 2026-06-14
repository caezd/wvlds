"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
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
          href={item.url}
          download={item.name}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center size-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <Download className="size-4" />
        </a>
        <button
          onClick={onClose}
          className="flex items-center justify-center size-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Image principale */}
      <div className="flex-1 flex items-center justify-center p-16">
        <img
          key={current}
          src={item.url}
          alt={item.name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-xl object-contain select-none"
          style={{ maxHeight: "calc(100vh - 8rem)" }}
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
                "size-16 rounded-lg overflow-hidden shrink-0 border-2 transition-all",
                i === current ? "border-white" : "border-transparent opacity-50 hover:opacity-80",
              )}
            >
              <img src={it.url} alt={it.name} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
