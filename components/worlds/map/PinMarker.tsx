"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { type MapPin as MapPinType } from "@/app/actions/worldMap";

export function PinMarker({
  pin,
  isSelected,
  isEditMode,
  imgRef,
  scale,
  onPinClick,
  onDelete,
  onMoved,
}: {
  pin: MapPinType;
  isSelected: boolean;
  isEditMode: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  scale: number;
  onPinClick: (clientX: number, clientY: number) => void;
  onDelete: () => void;
  onMoved: (x: number, y: number) => void;
}) {
  const t = useTranslations("map");
  const [localX, setLocalX] = React.useState(pin.x);
  const [localY, setLocalY] = React.useState(pin.y);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef<{
    clientX: number; clientY: number; startX: number; startY: number;
  } | null>(null);
  const didDrag = React.useRef(false);

  // Sync position quand le pin change depuis l'extérieur (realtime)
  React.useEffect(() => {
    if (!isDragging) { setLocalX(pin.x); setLocalY(pin.y); }
  }, [pin.x, pin.y, isDragging]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation(); // empêche le pan du container
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, startX: pin.x, startY: pin.y };
    didDrag.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !isEditMode) return;
    const dx = e.clientX - dragStart.current.clientX;
    const dy = e.clientY - dragStart.current.clientY;
    if (!didDrag.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      didDrag.current = true;
      setIsDragging(true);
    }
    if (!didDrag.current) return;
    const img = imgRef.current;
    if (!img) return;
    // getBoundingClientRect tient compte du scale CSS appliqué au parent
    const r = img.getBoundingClientRect();
    setLocalX(Math.max(0, Math.min(100, dragStart.current.startX + (dx / r.width) * 100)));
    setLocalY(Math.max(0, Math.min(100, dragStart.current.startY + (dy / r.height) * 100)));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasDrag = didDrag.current;
    dragStart.current = null;
    didDrag.current = false;
    setIsDragging(false);
    if (wasDrag && isEditMode) {
      onMoved(localX, localY);
    } else {
      onPinClick(e.clientX, e.clientY);
    }
  }

  return (
    <div
      className={cn(
        "absolute group",
        isDragging ? "z-30" : "z-10",
        isEditMode && !isDragging && "cursor-grab",
        isDragging && "cursor-grabbing",
      )}
      style={{
        left: `${localX}%`,
        top: `${localY}%`,
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
        transformOrigin: "center center",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => e.stopPropagation()} // empêche handleContainerClick
    >
      {/* Halo sélectionné */}
      {isSelected && !isDragging && pin.color && pin.color !== "transparent" && (
        <span
          className="absolute inset-0 -m-1.5 rounded-full animate-ping opacity-30"
          style={{ backgroundColor: pin.color }}
        />
      )}

      {/* Cercle du pin */}
      <div
        aria-label={pin.title}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform",
          !isDragging && "hover:scale-110",
          isSelected && !isDragging && "scale-110 ring-2 ring-white ring-offset-1",
          isDragging && "scale-125 opacity-90 shadow-xl",
        )}
        style={{
          backgroundColor: pin.color || "transparent",
          border: pin.border_color
            ? `2px ${pin.border_style || "solid"} ${pin.border_color}`
            : "none",
        }}
      >
        {pin.icon && (
          <LazyLucideIcon
            name={pin.icon}
            className="h-4 w-4"
            style={{ color: pin.icon_color || "#ffffff" }}
          />
        )}
      </div>

      {/* Label au survol */}
      {!isDragging && (
        <div className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {pin.title}
        </div>
      )}

      {/* Bouton supprimer (edit mode uniquement, sur hover) */}
      {isEditMode && !isDragging && (
        <button
          type="button"
          aria-label={t("deletePin")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
