"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { Check, Loader2, Map, MapPin, Pencil, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { toWebP } from "@/lib/imageUtils";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import {
  createMapPin,
  deleteMapPin,
  getWorldMap,
  updateMapPin,
  upsertWorldMap,
  type MapPin as MapPinType,
  type WorldMapData,
} from "@/app/actions/worldMap";

// Les quatre pièces de l'interface d'un point — marqueur, panneau flottant,
// dialogue d'apparence, sélecteur de couleur — vivent à côté. Ce fichier ne
// garde que la carte elle-même : chargement, image de fond, pose des points.
import { PinMarker } from "./PinMarker";
import { PinPopover } from "./PinPopover";
import { calcPopoverPos } from "./popoverPosition";
import type { PinPopoverPos, PendingPin } from "./types";

// ── Main component ─────────────────────────────────────────────────

export function WorldMap({
  worldId,
  userId,
  canEdit,
}: {
  worldId: string;
  userId: string;
  canEdit: boolean;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const reconnectEpoch = useReconnectEpoch();

  const [mapData, setMapData] = React.useState<WorldMapData | null>(null);
  const [pins, setPins] = React.useState<MapPinType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);

  const [selectedPin, setSelectedPin] = React.useState<MapPinType | null>(null);
  const [popoverPos, setPopoverPos] = React.useState<PinPopoverPos | null>(null);

  const [pendingPin, setPendingPin] = React.useState<PendingPin | null>(null);
  const [creatingPin, setCreatingPin] = React.useState(false);

  const [uploadingMap, setUploadingMap] = React.useState(false);

  // ── Pan + zoom state ─────────────────────────────────────────
  const [scale, setScale] = React.useState(1);
  const [offsetX, setOffsetX] = React.useState(0);
  const [offsetY, setOffsetY] = React.useState(0);
  const [isPanning, setIsPanning] = React.useState(false);
  const panStart = React.useRef<{
    clientX: number; clientY: number;
    startOffsetX: number; startOffsetY: number;
  } | null>(null);
  const didPan = React.useRef(false);

  // Refs pour le wheel handler non-passif (évite les stale closures)
  const scaleRef = React.useRef(scale);
  scaleRef.current = scale;
  const offsetXRef = React.useRef(offsetX);
  offsetXRef.current = offsetX;
  const offsetYRef = React.useRef(offsetY);
  offsetYRef.current = offsetY;

  const mapFileInputRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wheelCleanupRef = React.useRef<(() => void) | null>(null);

  const isEditMode = canEdit && editMode;

  // Reset pan/zoom quand l'image change
  React.useEffect(() => { setScale(1); setOffsetX(0); setOffsetY(0); }, [mapData?.image_url]);

  // ── Chargement initial ────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { map, pins: p } = await getWorldMap(worldId);
        if (!cancelled) {
          setMapData(map);
          setPins(p);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    type RT = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

    // Realtime subscriptions
    const channel = supabase
      .channel(`world-map-${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "world_map_pins", filter: `world_id=eq.${worldId}` },
        (payload: RT) => {
          if (payload.eventType === "INSERT") {
            setPins((prev) => [...prev, payload.new as MapPinType]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as MapPinType;
            setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPin((prev) => (prev?.id === updated.id ? updated : prev));
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setPins((prev) => prev.filter((p) => p.id !== id));
            setSelectedPin((prev) => (prev?.id === id ? null : prev));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "world_maps", filter: `world_id=eq.${worldId}` },
        (payload: RT) => {
          setMapData(payload.new as WorldMapData);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, reconnectEpoch]);

  // ── Upload de l'image de carte ────────────────────────────────
  async function handleMapImageUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("imagesOnly"));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("fileTooLarge20"));
      return;
    }
    setUploadingMap(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté.");

      const converted = await toWebP(file, 4096);
      const path = `user-${userId}/world-${worldId}/map-${Date.now()}.webp`;

      const { error: upErr } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { upsert: true, contentType: converted.type });
      if (upErr) throw upErr;

      const image_url = supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;
      const updated = await upsertWorldMap(worldId, { image_url });
      setMapData(updated);
      toast.success(t("mapUpdated"));
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploadingMap(false);
    }
  }

  // ── Helpers de clamp ─────────────────────────────────────────
  function clampOffset(x: number, y: number, s: number): [number, number] {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return [x, y];
    const minX = Math.min(0, container.clientWidth - img.offsetWidth * s);
    const minY = Math.min(0, container.clientHeight - img.offsetHeight * s);
    return [
      Math.max(minX, Math.min(0, x)),
      Math.max(minY, Math.min(0, y)),
    ];
  }

  // ── Wheel zoom (non-passif, centré sur le curseur) ───────────
  // Callback ref : s'exécute quand l'élément entre/sort du DOM,
  // évitant tout problème de taille de tableau de dépendances.
  const containerCallbackRef = React.useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    containerRef.current = el;
    if (!el) return;
    const node = el; // variable non-nullable pour la closure

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const curS = scaleRef.current;
      const curOX = offsetXRef.current;
      const curOY = offsetYRef.current;

      const newS = Math.max(1, Math.min(2, curS + (e.deltaY < 0 ? 0.1 : -0.1)));
      if (newS === curS) return;

      const rect = node.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const ix = (cx - curOX) / curS;
      const iy = (cy - curOY) / curS;

      let newOX = cx - ix * newS;
      let newOY = cy - iy * newS;

      const img = imageRef.current;
      if (img) {
        const minX = Math.min(0, node.clientWidth - img.offsetWidth * newS);
        const minY = Math.min(0, node.clientHeight - img.offsetHeight * newS);
        newOX = Math.max(minX, Math.min(0, newOX));
        newOY = Math.max(minY, Math.min(0, newOY));
      }

      setScale(newS);
      setOffsetX(newOX);
      setOffsetY(newOY);
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    wheelCleanupRef.current = () => node.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pan handlers ─────────────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    didPan.current = false;
    panStart.current = {
      clientX: e.clientX, clientY: e.clientY,
      startOffsetX: offsetX, startOffsetY: offsetY,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.clientX;
    const dy = e.clientY - panStart.current.clientY;
    if (!didPan.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) didPan.current = true;
    if (!didPan.current) return;
    const [cx, cy] = clampOffset(
      panStart.current.startOffsetX + dx,
      panStart.current.startOffsetY + dy,
      scale,
    );
    setOffsetX(cx);
    setOffsetY(cy);
  }

  function handlePointerUp() {
    setIsPanning(false);
    panStart.current = null;
    // didPan.current est relu dans handleContainerClick qui s'exécute juste après
  }

  // ── Clic sur la carte (ajouter un pin si pas de drag) ────────
  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (didPan.current) { didPan.current = false; return; }
    didPan.current = false;

    if (pendingPin) { setPendingPin(null); return; }
    if (selectedPin) { setSelectedPin(null); setPopoverPos(null); return; }

    if (!isEditMode) return;

    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;
    const rect = container.getBoundingClientRect();
    // Coordonnées dans l'espace image (avant scale)
    const pxX = (e.clientX - rect.left - offsetX) / scale;
    const pxY = (e.clientY - rect.top - offsetY) / scale;
    const x = (pxX / img.offsetWidth) * 100;
    const y = (pxY / img.offsetHeight) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    setPendingPin({ x, y, title: "" });
  }

  async function handleCreatePin() {
    if (!pendingPin || !pendingPin.title.trim() || creatingPin) return;
    setCreatingPin(true);
    try {
      const pin = await createMapPin(worldId, pendingPin.x, pendingPin.y, pendingPin.title.trim());
      setPins((prev) => [...prev, pin]);
      setPendingPin(null);
      // Ouvrir immédiatement la popover du nouveau pin au centre de l'écran
      setSelectedPin(pin);
      setPopoverPos(calcPopoverPos(window.innerWidth / 2, window.innerHeight / 2));
    } catch {
      toast.error(t("createPinError"));
    } finally {
      setCreatingPin(false);
    }
  }

  function handlePinClick(clientX: number, clientY: number, pin: MapPinType) {
    if (selectedPin?.id === pin.id) {
      setSelectedPin(null);
      setPopoverPos(null);
      return;
    }
    setSelectedPin(pin);
    setPopoverPos(calcPopoverPos(clientX, clientY));
    setPendingPin(null);
  }

  async function handlePinMoved(pin: MapPinType, x: number, y: number) {
    // Optimiste : mise à jour locale immédiate
    const updated = { ...pin, x, y };
    setPins((prev) => prev.map((p) => (p.id === pin.id ? updated : p)));
    if (selectedPin?.id === pin.id) setSelectedPin(updated);
    try {
      await updateMapPin(pin.id, { x, y });
    } catch {
      toast.error(t("movePinError"));
      // Rollback
      setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
    }
  }

  async function handleDeletePin(pin: MapPinType) {
    try {
      await deleteMapPin(pin.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
      if (selectedPin?.id === pin.id) {
        setSelectedPin(null);
        setPopoverPos(null);
      }
      toast.success(t("pinDeleted"));
    } catch {
      toast.error(t("deletePinError"));
    }
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      onClick={() => {
        if (pendingPin) setPendingPin(null);
        if (selectedPin) { setSelectedPin(null); setPopoverPos(null); }
      }}
    >
      <WorldPanelHeader
        icon={<Map className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); setSelectedPin(null); setPopoverPos(null); setPendingPin(null); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isEditMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
              {isEditMode ? t("editingActive") : tCommon("edit")}
            </button>
          )
        }
      >
        {canEdit && isEditMode && mapData?.image_url && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mapFileInputRef.current?.click(); }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {uploadingMap ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {t("changeMap")}
          </button>
        )}
      </WorldPanelHeader>

      {/* ── Corps ──────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">

        {!mapData?.image_url ? (
          /* ── État vide ───────────────────────────────────────── */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <Map className="h-12 w-12 opacity-20" />
            <p className="text-sm">{t("noMapConfigured")}</p>
            {isEditMode && (
              <button
                type="button"
                onClick={() => mapFileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border px-6 py-3 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
              >
                {uploadingMap ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("importMapImage")}
              </button>
            )}
          </div>
        ) : (
          /* ── Carte avec image ────────────────────────────────── */
          <div
            ref={containerCallbackRef}
            className="relative flex-1 overflow-hidden select-none"
            style={{ cursor: isPanning ? "grabbing" : isEditMode ? "crosshair" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleContainerClick}
          >
            {/* Wrapper pan+zoom — transform-origin top-left */}
            <div
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
                transformOrigin: "0 0",
              }}
            >
              {/* Image : couvre toujours toute la largeur du container.
                  imageRef.offsetWidth/offsetHeight pilotent le clamp du pan/zoom —
                  next/image (fill) changerait ce comportement de dimensionnement intrinsèque. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={mapData.image_url}
                alt={t("mapAlt")}
                draggable={false}
                className="block w-full select-none"
                style={{ userSelect: "none" }}
              />

              {/* Pins existants */}
              {pins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  isSelected={selectedPin?.id === pin.id}
                  isEditMode={isEditMode}
                  imgRef={imageRef}
                  scale={scale}
                  onPinClick={(cx, cy) => handlePinClick(cx, cy, pin)}
                  onDelete={() => void handleDeletePin(pin)}
                  onMoved={(x, y) => void handlePinMoved(pin, x, y)}
                />
              ))}

              {/* Pin en cours de création — même pivot que PinMarker (-50%,-50%) */}
              {pendingPin && (
                <div
                  className="absolute z-20"
                  style={{
                    left: `${pendingPin.x}%`,
                    top: `${pendingPin.y}%`,
                    transform: `translate(-50%, -50%) scale(${1 / scale})`,
                    transformOrigin: "center center",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Marqueur temporaire */}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary opacity-70 shadow-md">
                    <MapPin className="h-4 w-4 text-white" />
                  </div>

                  {/* Formulaire flottant au-dessus */}
                  <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1.5 shadow-xl">
                    <input
                      autoFocus
                      value={pendingPin.title}
                      onChange={(e) =>
                        setPendingPin((p) => p ? { ...p, title: e.target.value } : p)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreatePin();
                        if (e.key === "Escape") setPendingPin(null);
                      }}
                      placeholder={t("locationName")}
                      className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      disabled={!pendingPin.title.trim() || creatingPin}
                      onClick={handleCreatePin}
                      className="flex h-5 w-5 items-center justify-center rounded text-primary disabled:opacity-40 hover:bg-primary/10"
                    >
                      {creatingPin ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      aria-label={tCommon("cancel")}
                      type="button"
                      onClick={() => setPendingPin(null)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Indice d'aide en mode édition (sticky sur le container) */}
            {isEditMode && !pendingPin && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white opacity-70">
                {t("clickToAddPin")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Popover pin sélectionné ─────────────────────────────── */}
      {selectedPin && popoverPos && (
        <PinPopover
          key={selectedPin.id}
          pin={selectedPin}
          pos={popoverPos}
          isEditMode={isEditMode}
          userId={userId}
          worldId={worldId}
          onClose={() => { setSelectedPin(null); setPopoverPos(null); }}
          onUpdated={(updated) => {
            setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPin(updated);
          }}
          onDelete={() => void handleDeletePin(selectedPin)}
        />
      )}

      {/* Input fichier carte caché */}
      <input
        ref={mapFileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleMapImageUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
