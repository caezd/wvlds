"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { blobToWebP } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import {
  AVATAR_SIZE,
  avatarCategories,
  avatarParts,
  assetUrl,
  type AvatarCategory,
  type AvatarPartRef,
} from "./avatarCatalog";

type LayerItem = { partId: string; variantKey?: string };

export type AvatarConfigV1 = {
  v: 1;
  layers: Record<string, { items: LayerItem[] }>;
};

type SaveResult = { avatarUrl: string | null; config: AvatarConfigV1 | null };

const imageCache = new Map<string, Promise<HTMLImageElement>>();

const TEXTURE_REL_PATH = "texture_paper.png";
const TEXTURE_BLEND: GlobalCompositeOperation = "overlay";
const TEXTURE_ALPHA = 0.8;

type VariantForUi = NonNullable<AvatarPartRef["variants"]>[number];

function parseHexColor(
  hex: string | undefined | null,
): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const raw = String(hex).trim().replace(/^#/, "");
  // Support #RGB or #RRGGBB only (ignore non-standard lengths like 5)
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  // r,g,b in [0..255]
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case rr:
        h = ((gg - bb) / d) % 6;
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      case bb:
        h = (rr - gg) / d + 4;
        break;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

function colorFamilyIndex(h: number, s: number, l: number): number {
  // Neutrals (grays / near-white / near-black) at the end
  if (s < 0.1 || l < 0.08 || l > 0.95) return 8;

  if (h >= 345 || h < 20) return 0; // red
  if (h < 45) return 1; // orange
  if (h < 70) return 2; // yellow
  if (h < 170) return 3; // green
  if (h < 200) return 4; // cyan
  if (h < 255) return 5; // blue
  if (h < 290) return 6; // purple
  return 7; // magenta
}

/**
 * Helper UI:
 * Trie les variantes "color" de façon stable par familles (rouges → oranges → … → neutres),
 * puis par teinte / luminosité. Les variantes non-couleur restent à la fin, dans l’ordre original.
 */
function sortVariantsForDisplay(
  variants: AvatarPartRef["variants"] | undefined,
): VariantForUi[] {
  const list = variants ?? [];
  if (list.length <= 1) return list as VariantForUi[];

  const decorated = list.map((v, idx) => {
    const isColor = v.type === "color" && !!v.hex;
    const rgb = isColor ? parseHexColor(v.hex) : null;
    const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;

    return {
      v,
      idx,
      isColor,
      valid: !!hsl,
      family: hsl ? colorFamilyIndex(hsl.h, hsl.s, hsl.l) : 999,
      h: hsl?.h ?? 0,
      s: hsl?.s ?? 0,
      l: hsl?.l ?? 0,
    };
  });

  decorated.sort((a, b) => {
    // Colors first
    if (a.isColor !== b.isColor) return a.isColor ? -1 : 1;

    // Non-color: keep original order
    if (!a.isColor && !b.isColor) return a.idx - b.idx;

    // Both are "color": valid hex first
    if (a.valid !== b.valid) return a.valid ? -1 : 1;

    // Invalid hex: keep original order
    if (!a.valid && !b.valid) return a.idx - b.idx;

    // Both valid: family -> hue -> lightness -> saturation
    if (a.family !== b.family) return a.family - b.family;

    // Neutrals: sort by lightness then original
    if (a.family === 8) {
      if (a.l !== b.l) return a.l - b.l;
      return a.idx - b.idx;
    }

    if (a.h !== b.h) return a.h - b.h;
    if (a.l !== b.l) return a.l - b.l;
    if (a.s !== b.s) return a.s - b.s;
    return a.idx - b.idx;
  });

  return decorated.map((d) => d.v) as VariantForUi[];
}

function pickDefaultVariantKey(part: AvatarPartRef): string | undefined {
  if (!part.variants?.length) return undefined;
  return part.defaultVariantKey ?? part.variants[0]?.key;
}

function resolveVariantPath(part: AvatarPartRef, variantKey?: string) {
  if (!part.variants?.length) return part.path;
  const v = part.variants.find((x) => x.key === variantKey) ?? part.variants[0];
  return v?.path ?? part.path;
}

function resolveVariantThumbPath(part: AvatarPartRef, variantKey?: string) {
  if (!part.variants?.length) return part.thumbPath ?? part.path;
  const v = part.variants.find((x) => x.key === variantKey) ?? part.variants[0];
  return v?.thumbPath ?? v?.path ?? part.thumbPath ?? part.path;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Failed to load: ${url}`));
    im.src = url;
  });

  imageCache.set(url, p);
  return p;
}

function isRequired(cat: AvatarCategory) {
  return cat.allowNone === false;
}

function defaultItemsForCategory(cat: AvatarCategory): LayerItem[] {
  const partsInCat = avatarParts.filter((p) => p.category === cat.key);
  if (!partsInCat.length) return [];

  const defaults = partsInCat.filter((p) => p.byDefault);

  // multi: on peut activer plusieurs defaults si tu en as
  if (cat.multi) {
    const list = (defaults.length ? defaults : [partsInCat[0]]).map((p) => ({
      partId: p.id,
      variantKey: pickDefaultVariantKey(p),
    }));
    return list;
  }

  const chosen = defaults[0] ?? partsInCat[0];
  return chosen
    ? [{ partId: chosen.id, variantKey: pickDefaultVariantKey(chosen) }]
    : [];
}

function buildDefaultConfig(): AvatarConfigV1 {
  const layers: AvatarConfigV1["layers"] = {};

  for (const cat of avatarCategories) {
    // alwaysOn => toujours default
    if (cat.alwaysOn) {
      layers[cat.key] = { items: defaultItemsForCategory(cat) };
      continue;
    }

    const defaults = defaultItemsForCategory(cat);

    // required => toujours au moins 1
    if (isRequired(cat)) {
      layers[cat.key] = { items: defaults };
      continue;
    }

    // allowNone=true => on met le default uniquement si un part est byDefault
    // (sinon on laisse vide)
    const hasExplicitByDefault = avatarParts.some(
      (p) => p.category === cat.key && p.byDefault,
    );
    layers[cat.key] = { items: hasExplicitByDefault ? defaults : [] };
  }

  return { v: 1, layers };
}

/**
 * Normalisation clé :
 * - Si le layer N'EXISTE PAS dans input.layers => on applique defaults (byDefault)
 * - Si le layer existe mais items=[] => on respecte le vide (sauf required/alwaysOn)
 */
function normalizeConfig(
  input: AvatarConfigV1 | null | undefined,
): AvatarConfigV1 {
  const base = buildDefaultConfig();

  if (!input || input.v !== 1 || !input.layers) return base;

  const out: AvatarConfigV1 = { v: 1, layers: {} };

  for (const cat of avatarCategories) {
    const partsInCat = avatarParts.filter((p) => p.category === cat.key);
    const allowedIds = new Set(partsInCat.map((p) => p.id));

    const layer = input.layers[cat.key]; // peut être undefined (layer manquant)
    const layerMissing = layer === undefined;

    // si layer manquant => defaults (ou vide selon règle)
    if (layerMissing) {
      out.layers[cat.key] = base.layers[cat.key] ?? { items: [] };
      continue;
    }

    // layer existe, items peut être []
    let items = Array.isArray(layer?.items) ? layer!.items.slice() : [];

    // toujours forcer alwaysOn
    if (cat.alwaysOn) {
      out.layers[cat.key] = { items: defaultItemsForCategory(cat) };
      continue;
    }

    // filtrer invalid
    items = items.filter((it) => allowedIds.has(it.partId));

    // single-select
    if (!cat.multi && items.length > 1) items = [items[0]];

    // required => si vide, on remet default
    if (isRequired(cat) && items.length === 0) {
      items = defaultItemsForCategory(cat);
    }

    // normaliser variantKey
    items = items.map((it) => {
      const part = partsInCat.find((p) => p.id === it.partId);
      if (!part?.variants?.length) return { partId: it.partId };
      const ok =
        it.variantKey && part.variants.some((v) => v.key === it.variantKey);
      return {
        partId: it.partId,
        variantKey: ok ? it.variantKey : pickDefaultVariantKey(part),
      };
    });

    out.layers[cat.key] = { items };
  }

  return out;
}

function buildDrawPlan(config: AvatarConfigV1) {
  const plan: Array<{
    z: number;
    url: string;
    alpha: number;
    blend: GlobalCompositeOperation;
  }> = [];

  for (const cat of avatarCategories) {
    const items = config.layers[cat.key]?.items ?? [];
    for (const it of items) {
      const part = avatarParts.find((p) => p.id === it.partId);
      if (!part) continue;

      const rel = resolveVariantPath(
        part,
        it.variantKey ?? pickDefaultVariantKey(part),
      );
      if (!rel) continue;

      plan.push({
        z: (cat.zBase ?? 0) + (part.z ?? 0),
        url: assetUrl(part.category, rel),
        alpha: typeof part.alpha === "number" ? part.alpha : 1,
        blend: (part.blendMode as GlobalCompositeOperation) ?? "source-over",
      });
    }
  }

  plan.sort((a, b) => a.z - b.z);

  // Texture papier forcée sur tout le rendu (non désactivable par l’utilisateur)
  plan.push({
    z: Number.MAX_SAFE_INTEGER,
    url: assetUrl("fx", TEXTURE_REL_PATH),
    alpha: TEXTURE_ALPHA,
    blend: TEXTURE_BLEND,
  });
  return plan;
}

function findGroupVariantSelection(
  config: AvatarConfigV1,
  group: string,
): { part: AvatarPartRef; key: string } | null {
  for (const layer of Object.values(config.layers ?? {})) {
    for (const it of layer.items ?? []) {
      const part = avatarParts.find((p) => p.id === it.partId);
      if (!part) continue;

      const pGroup = part.variantGroup ?? part.drivesVariantGroup;
      if (pGroup !== group) continue;

      const key = it.variantKey ?? pickDefaultVariantKey(part);
      if (!key) continue;

      return { part, key };
    }
  }
  return null;
}

function partSupportsVariantKey(part: AvatarPartRef, key: string) {
  return !!part.variants?.some((v) => v.key === key);
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

function normalizeHexLike(s: string) {
  return s.trim().replace(/^#/, "").toUpperCase();
}

function resolveVariantKeyFromSource(
  targetPart: AvatarPartRef,
  sourcePart: AvatarPartRef,
  sourceVariantKey: string,
): string | undefined {
  // 1) key identique => OK
  if (partSupportsVariantKey(targetPart, sourceVariantKey))
    return sourceVariantKey;

  const src = sourcePart.variants?.find((v) => v.key === sourceVariantKey);
  const tvs = targetPart.variants ?? [];
  if (!src || tvs.length === 0) return undefined;

  // 2) Si c’est une couleur: tenter match hex (ou label hex)
  if ((src.type ?? "other") === "color") {
    const wanted = normalizeHexLike(src.hex ?? src.label ?? "");
    if (wanted) {
      const hit = tvs.find((v) => {
        const cand = normalizeHexLike(v.hex ?? v.label ?? "");
        return cand && cand === wanted;
      });
      if (hit) return hit.key;
    }
  }

  // 3) Match label exact (utile si tu as des labels "Pale", "Tan", etc.)
  if (src.label) {
    const hit = tvs.find((v) => v.label === src.label);
    if (hit) return hit.key;
  }

  // 4) Fallback index “même type” (si les palettes sont alignées)
  const srcType = src.type ?? "other";
  const srcList = (sourcePart.variants ?? []).filter(
    (v) => (v.type ?? "other") === srcType,
  );
  const tgtList = tvs.filter((v) => (v.type ?? "other") === srcType);

  const idx = srcList.findIndex((v) => v.key === sourceVariantKey);
  if (idx >= 0 && idx < tgtList.length) return tgtList[idx].key;

  return undefined;
}

export function PersonaAvatarPicker({
  personaId,
  initialConfig,
  onSaved,
}: {
  personaId: string;
  initialConfig?: AvatarConfigV1 | null;
  onSaved?: (result: SaveResult) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();

  const [config, setConfig] = React.useState<AvatarConfigV1>(() =>
    normalizeConfig(initialConfig ?? null),
  );

  const visibleCategories = React.useMemo(
    () => avatarCategories.filter((c) => !c.hidden),
    [],
  );

  const [activeLayer, setActiveLayer] = React.useState<string>(
    () => visibleCategories[0]?.key ?? "",
  );
  const [focusedPartId, setFocusedPartId] = React.useState<string | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Lookup rapide + mémorisation du dernier focus par onglet (layer)
  const partById = React.useMemo(() => {
    return new Map<string, AvatarPartRef>(avatarParts.map((p) => [p.id, p]));
  }, [avatarParts]);

  const lastFocusedByLayerRef = React.useRef<Record<string, string>>({});

  const activeCategory = React.useMemo(
    () =>
      visibleCategories.find((c) => c.key === activeLayer) ??
      visibleCategories[0],
    [activeLayer, visibleCategories],
  );

  const partsInLayer = React.useMemo(
    () => avatarParts.filter((p) => p.category === activeLayer),
    [activeLayer],
  );

  const selectedItems = React.useMemo(
    () => config.layers[activeLayer]?.items ?? [],
    [config, activeLayer],
  );

  function focusPart(partId: string | null) {
    setFocusedPartId(partId);
    if (!partId) return;

    const p = partById.get(partId);
    if (!p) return;

    lastFocusedByLayerRef.current[p.category] = partId;
  }

  const effectiveFocusedPartId = React.useMemo(() => {
    // 1) Focus "hover" seulement s'il appartient au layer actif
    if (focusedPartId) {
      const p = partById.get(focusedPartId);
      if (p && p.category === activeLayer) return focusedPartId;
    }

    // 2) Dernier focus mémorisé pour ce layer
    const remembered = lastFocusedByLayerRef.current[activeLayer];
    if (remembered) {
      const p = partById.get(remembered);
      if (p && p.category === activeLayer) return remembered;
    }

    // 3) Sinon l'item sélectionné (s'il existe)
    const selected = selectedItems[0]?.partId;
    if (selected) return selected;

    // 4) Sinon le premier part du layer (permet d'afficher les variantes immédiatement)
    return partsInLayer[0]?.id ?? null;
  }, [activeLayer, focusedPartId, partById, partsInLayer, selectedItems]);

  const focusedPart = React.useMemo(() => {
    if (!effectiveFocusedPartId) return null;
    return partById.get(effectiveFocusedPartId) ?? null;
  }, [effectiveFocusedPartId, partById]);

  const variantTargetPartId = React.useMemo(() => {
    if (!activeCategory) return null;

    // Mode unique: la variante doit toujours viser l'item sélectionné
    if (!activeCategory.multi) {
      return selectedItems[0]?.partId ?? null;
    }

    // Mode multi: on vise le focused s'il est sélectionné, sinon le premier sélectionné
    const fp = focusedPart?.id ?? null;
    if (fp && selectedItems.some((x) => x.partId === fp)) return fp;
    return selectedItems[0]?.partId ?? null;
  }, [activeCategory, selectedItems, focusedPart]);

  const variantTargetPart = React.useMemo(() => {
    if (!variantTargetPartId) return null;
    return avatarParts.find((p) => p.id === variantTargetPartId) ?? null;
  }, [variantTargetPartId]);

  const variantTargetItem = React.useMemo(() => {
    const pid = variantTargetPart?.id;
    if (!pid) return null;
    return selectedItems.find((x) => x.partId === pid) ?? null;
  }, [variantTargetPart, selectedItems]);

  function setLayerItems(nextItems: LayerItem[]) {
    setConfig((prev) => ({
      ...prev,
      layers: {
        ...prev.layers,
        [activeLayer]: { items: nextItems },
      },
    }));
  }

  function selectPart(part: AvatarPartRef) {
    if (!activeCategory) return;

    // Si ce part appartient à un groupe de variantes (ex: skin),
    // on aligne sa variante sur la valeur déjà choisie dans le groupe.
    const group = part.variantGroup ?? part.drivesVariantGroup;
    const sel = group ? findGroupVariantSelection(config, group) : null;

    const mapped = sel
      ? resolveVariantKeyFromSource(part, sel.part, sel.key)
      : undefined;

    const nextVariant = mapped ?? pickDefaultVariantKey(part);
    const isMulti = !!activeCategory.multi;

    if (!isMulti) {
      setLayerItems([{ partId: part.id, variantKey: nextVariant }]);
      focusPart(part.id);
      return;
    }

    const items = selectedItems.slice();
    const exists = items.some((x) => x.partId === part.id);

    if (exists) {
      setLayerItems(items.filter((x) => x.partId !== part.id));
      focusPart(null);
    } else {
      setLayerItems([...items, { partId: part.id, variantKey: nextVariant }]);
      focusPart(part.id);
    }
  }

  function canClearLayer(cat: AvatarCategory | undefined | null) {
    if (!cat) return false;
    if (cat.alwaysOn) return false;
    if (isRequired(cat)) return false;
    return !!cat.allowNone;
  }

  function clearLayer() {
    if (!canClearLayer(activeCategory)) return;
    setLayerItems([]);
    focusPart(null);
  }

  function setVariant(partId: string, variantKey: string) {
    setConfig((prev) => {
      const sourcePart = avatarParts.find((p) => p.id === partId) ?? null;
      const driveGroup =
        sourcePart?.drivesVariantGroup ?? sourcePart?.variantGroup ?? null;

      const cat =
        visibleCategories.find((c) => c.key === activeLayer) ??
        visibleCategories[0] ??
        null;

      const isMulti = !!cat?.multi;

      const activeItems = (prev.layers[activeLayer]?.items ?? []).slice();
      const idx = activeItems.findIndex((x) => x.partId === partId);

      // 1) Update (ou insert) dans la layer active
      const nextActiveItems =
        idx >= 0
          ? activeItems.map((x) =>
              x.partId === partId ? { ...x, variantKey } : x,
            )
          : isMulti
            ? [...activeItems, { partId, variantKey }]
            : [{ partId, variantKey }];

      let next: AvatarConfigV1 = {
        ...prev,
        layers: {
          ...prev.layers,
          [activeLayer]: { items: nextActiveItems },
        },
      };

      // 2) Propagation si ce part pilote un groupe
      if (!driveGroup) return next;

      const layers: AvatarConfigV1["layers"] = {};

      for (const [layerKey, layer] of Object.entries(next.layers)) {
        const items = (layer.items ?? []).map((it) => {
          if (it.partId === partId) return it; // déjà modifié (ou inséré)
          const p = avatarParts.find((pp) => pp.id === it.partId);
          if (!p) return it;
          const pGroup = p.variantGroup ?? p.drivesVariantGroup;
          if (pGroup !== driveGroup) return it;

          const mapped = sourcePart
            ? resolveVariantKeyFromSource(p, sourcePart, variantKey)
            : undefined;

          if (!mapped) return it;
          return { ...it, variantKey: mapped };
        });

        layers[layerKey] = { items };
      }

      return { ...next, layers };
    });
  }

  React.useEffect(() => {
    // Ancre le focus sur la sélection du nouvel onglet (évite les surprises)
    setFocusedPartId(selectedItems[0]?.partId ?? null);

    // Précharge les thumbs visibles (limité pour ne pas saturer le réseau)
    const urls = new Set<string>();

    for (const part of partsInLayer.slice(0, 48)) {
      const vk =
        selectedItems.find((x) => x.partId === part.id)?.variantKey ??
        pickDefaultVariantKey(part);

      const rel = resolveVariantThumbPath(part, vk);
      if (rel) urls.add(assetUrl(part.category, rel));
    }

    // Précharge aussi les thumbs de variantes du part actuellement ciblé
    if (variantTargetPart?.variants?.length) {
      for (const v of variantTargetPart.variants) {
        const thumb = v.thumbPath ?? v.path;
        if (thumb) urls.add(assetUrl(variantTargetPart.category, thumb));
      }
    }

    urls.forEach((u) => void loadImage(u).catch(() => {}));
  }, [activeLayer, partsInLayer, selectedItems, variantTargetPart?.id]);

  function resetToDefault() {
    setConfig(buildDefaultConfig());
    setFocusedPartId(null);
    setStatus("Réinitialisé.");
  }

  // Render canvas
  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setBusy(true);

      try {
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

        const plan = buildDrawPlan(config);

        for (const it of plan) {
          try {
            const im = await loadImage(it.url);
            if (cancelled) return;

            ctx.save();
            ctx.globalCompositeOperation = it.blend;
            ctx.globalAlpha = it.alpha;
            ctx.drawImage(im, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
            ctx.restore();
          } catch (e) {
            console.warn("Avatar layer failed to load:", it.url, e);
          }
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config]);

  async function saveAvatar() {
    setStatus(null);
    setBusy(true);

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas introuvable.");

      const normalized = normalizeConfig(config);

      // Upload vers Storage plutôt que stocker un data URL en base
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
      );
      const file = await blobToWebP(blob, `avatar-${personaId}`);
      const path = `avatars/${personaId}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("personas")
        .upload(path, file, { upsert: true, contentType: "image/webp" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("personas").getPublicUrl(path);
      const cleanUrl = urlData.publicUrl;
      const displayUrl = `${cleanUrl}?t=${Date.now()}`;

      const { error } = await supabase
        .from("personas")
        .update({ avatar_url: cleanUrl, avatar_config: normalized })
        .eq("id", personaId);
      if (error) throw error;

      setConfig(normalized);
      setStatus("Avatar enregistré.");
      onSaved?.({ avatarUrl: displayUrl, config: normalized });
      router.refresh();
    } catch (e: any) {
      setStatus(e?.message ?? "Erreur lors de l’enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="space-y-3">
        <div className="rounded-xl border p-4">
          <div className="mt-3 flex justify-center">
            <canvas
              ref={canvasRef}
              className={cn(
                "rounded-xl border bg-background",
                busy ? "opacity-80" : "",
              )}
              style={{ width: 220, height: 220 }}
            />
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void saveAvatar()}
              disabled={busy}
            >
              Sauvegarder
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={resetToDefault}
              disabled={busy}
            >
              Réinitialiser
            </Button>
          </div>

          {status ? (
            <div className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap">
              {status}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 min-w-0">
        <Tabs
          value={activeLayer}
          onValueChange={(v) => {
            setActiveLayer(v);
            setFocusedPartId(null);
          }}
        >
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-10 w-max flex-nowrap justify-start gap-1  bg-transparent">
              {visibleCategories.map((c) => {
                const tabThumbUrl = c.tabThumbPath
                  ? assetUrl(c.key, c.tabThumbPath)
                  : "";

                return (
                  <TabsTrigger
                    key={c.key}
                    value={c.key}
                    className="h-9 w-9 p-0 shrink-0"
                    title={c.label}
                    aria-label={c.label}
                  >
                    {tabThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tabThumbUrl}
                        alt=""
                        className="h-7 w-7 object-contain"
                        draggable={false}
                      />
                    ) : (
                      <span className="text-[11px] leading-none">
                        {c.label}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {visibleCategories.map((c) => (
            <TabsContent key={c.key} value={c.key} className="space-y-3">
              <div className="flex items-center justify-between">
                {canClearLayer(c) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearLayer}
                    disabled={busy}
                  >
                    Aucun
                  </Button>
                ) : null}
              </div>

              {variantTargetPart &&
              variantTargetPart.category === c.key &&
              variantTargetPart.variants?.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Variantes */}
                  {sortVariantsForDisplay(variantTargetPart.variants).map(
                    (v) => {
                      const current =
                        variantTargetItem?.variantKey ??
                        pickDefaultVariantKey(variantTargetPart);
                      const on = v.key === current;

                      if (v.type === "color" && v.hex) {
                        return (
                          <button
                            key={v.key}
                            type="button"
                            className={cn(
                              "h-7 w-7 rounded-full border",
                              on
                                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                : "opacity-90 hover:opacity-100",
                            )}
                            style={{ backgroundColor: v.hex }}
                            onClick={() =>
                              setVariant(variantTargetPart.id, v.key)
                            }
                            title={v.label}
                            aria-label={v.label}
                          />
                        );
                      }

                      const thumb = v.thumbPath ?? v.path;
                      const thumbUrl = assetUrl(focusedPart!.category, thumb);

                      return (
                        <button
                          key={v.key}
                          type="button"
                          className={cn(
                            "h-9 w-9 rounded-md border overflow-hidden grid place-items-center",
                            on
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                              : "opacity-90 hover:opacity-100",
                          )}
                          onClick={() => setVariant(focusedPart!.id, v.key)}
                          title={v.label}
                          aria-label={v.label}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            loading={on ? "eager" : "lazy"}
                            draggable={false}
                          />
                        </button>
                      );
                    },
                  )}
                </div>
              ) : null}

              <ScrollArea className="h-[560px] rounded-xl border">
                <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {partsInLayer.map((part) => {
                    const isSelected = selectedItems.some(
                      (x) => x.partId === part.id,
                    );

                    const vk =
                      selectedItems.find((x) => x.partId === part.id)
                        ?.variantKey ?? pickDefaultVariantKey(part);

                    const thumbRel = resolveVariantThumbPath(part, vk);
                    const thumbUrl = thumbRel
                      ? assetUrl(part.category, thumbRel)
                      : "";

                    return (
                      <button
                        key={part.id}
                        type="button"
                        className={cn(
                          "rounded-lg p-1 hover:bg-zinc-100 transition flex items-center justify-center dark:bg-zinc-300",
                          isSelected
                            ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                            : "",
                        )}
                        onClick={() => selectPart(part)}
                        onMouseEnter={() => focusPart(part.id)}
                        aria-label={part.label}
                        title={part.label}
                      >
                        {thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="text-[10px] text-muted-foreground">
                            {part.label}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="text-[11px] text-muted-foreground">
                {c.multi
                  ? "Mode multi: clic = toggle"
                  : "Mode unique: clic = remplacer"}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
