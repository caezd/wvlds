// components/personas/PersonaEditSheet.tsx
"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Coins, Flame, ImagePlus, Loader2, Pencil, RotateCcw, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

import { PersonaSectionsTabs } from "./PersonaSectionsTabs";
import type { PersonaSectionWithFields } from "@/types/personas";

import {
  PersonaAvatarPicker,
  type AvatarConfigV1,
} from "./avatar/PersonaAvatarPicker";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "P";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
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
// Onglet URL externe (partagé avatar + bannière)
// ---------------------------------------------------------------------------

function ExternalUrlTab({
  current,
  onSaved,
  aspect = "square",
}: {
  current?: string | null;
  onSaved: (url: string) => void;
  aspect?: "square" | "wide";
}) {
  const [url, setUrl] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-muted-foreground">
        Colle l'URL d'une image hébergée (jpg, png, webp…).
      </p>
      <Input
        placeholder="https://example.com/image.jpg"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null); }}
        onKeyDown={(e) => e.key === "Enter" && url.trim() && onSaved(url.trim())}
      />
      {url && (
        <div
          className={`overflow-hidden rounded-xl border bg-muted ${
            aspect === "wide" ? "h-28 w-full" : "h-32 w-32"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Aperçu"
            className="h-full w-full object-cover"
            onError={() => setError("Impossible de charger cette image.")}
            onLoad={() => setError(null)}
          />
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={() => url.trim() && onSaved(url.trim())} disabled={!url.trim()}>
        Utiliser cette image
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet upload fichier générique (avatar ou bannière)
// ---------------------------------------------------------------------------

function StorageUploadTab({
  personaId,
  supabase,
  userId,
  subfolder,
  dbColumn,
  extraUpdate,
  cropAspect,
  onSaved,
}: {
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  subfolder: string;
  dbColumn: string;
  extraUpdate?: Record<string, null>;
  /** Si fourni, un recadrage est proposé avant l'upload (ex: 1 pour carré). */
  cropAspect?: number;
  onSaved: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!userId) { setError("Non connecté."); return; }
    setUploading(true);
    setError(null);
    const path = `user-${userId}/${subfolder}/${personaId}`;
    const { error: upErr } = await supabase.storage
      .from("personas")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from("personas").getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from("personas")
      .update({ [dbColumn]: publicUrl, ...extraUpdate })
      .eq("id", personaId);
    if (dbErr) { setError(dbErr.message); setUploading(false); return; }
    setUploading(false);
    onSaved(publicUrl);
  }, [userId, subfolder, personaId, supabase, dbColumn, extraUpdate, onSaved]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (cropAspect !== undefined) {
      const objectUrl = URL.createObjectURL(f);
      setCropSrc(objectUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } else {
      void handleFile(f);
    }
    e.target.value = "";
  }

  async function onCropConfirm() {
    if (!cropSrc || !croppedAreaPixels) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels);
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      await handleFile(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du recadrage.");
      setUploading(false);
    }
  }

  function cancelCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  if (cropSrc) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Déplacez et zoomez pour recadrer l'image au format carré.
        </p>
        {/* Zone de crop — hauteur fixe obligatoire pour react-easy-crop */}
        <div className="relative h-64 rounded-lg overflow-hidden bg-black">
          <Cropper
            image={cropSrc}
            crop={crop}
            zoom={zoom}
            aspect={cropAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>
        {/* Slider zoom */}
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
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={cancelCrop} disabled={uploading}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Autre image
          </Button>
          <Button size="sm" onClick={onCropConfirm} disabled={uploading}>
            {uploading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Upload…</>
              : "Recadrer & enregistrer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choisissez une image depuis votre appareil (jpg, png, webp — max 5 Mo).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-lg border border-dashed px-6 py-8 w-full text-sm text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Upload en cours…</>
        ) : (
          <><ImagePlus className="h-5 w-5" /> Cliquez pour choisir un fichier</>
        )}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog bannière
// ---------------------------------------------------------------------------

function BannerSheet({
  open,
  onOpenChange,
  personaId,
  supabase,
  userId,
  currentBannerUrl,
  onSaved,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  currentBannerUrl: string | null;
  onSaved: (url: string) => void;
  onRemove: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Bannière du personnage</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <Tabs defaultValue="upload">
            <TabsList>
              <TabsTrigger value="upload">Depuis l'appareil</TabsTrigger>
              <TabsTrigger value="url">URL externe</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-4">
              <StorageUploadTab
                personaId={personaId}
                supabase={supabase}
                userId={userId}
                subfolder="banners"
                dbColumn="banner_url"
                onSaved={(url) => { onSaved(url); onOpenChange(false); }}
              />
            </TabsContent>
            <TabsContent value="url" className="mt-4">
              <ExternalUrlTab
                current={currentBannerUrl}
                aspect="wide"
                onSaved={async (url) => {
                  await supabase.from("personas").update({ banner_url: url }).eq("id", personaId);
                  onSaved(url);
                  onOpenChange(false);
                }}
              />
            </TabsContent>
          </Tabs>
          {currentBannerUrl && (
            <div className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  await supabase.from("personas").update({ banner_url: null }).eq("id", personaId);
                  onRemove();
                  onOpenChange(false);
                }}
              >
                <X className="h-4 w-4 mr-1.5" />
                Supprimer la bannière
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// Frame Picker
// ---------------------------------------------------------------------------

type OwnedFrame = { id: string; name: string; asset_url: string | null; preview_url: string | null };

function FramePicker({
  personaId,
  supabase,
  userId,
  initialFrameId,
}: {
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  initialFrameId: string | null;
}) {
  const [frames, setFrames] = useState<OwnedFrame[]>([]);
  const [selected, setSelected] = useState<string | null>(initialFrameId);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useMemo(() => {
    if (!userId) return;
    supabase
      .from("user_owned_cosmetics")
      .select("item:item_id(id, name, asset_url, preview_url)")
      .eq("user_id", userId)
      .then(({ data }) => {
        const items = (data ?? [])
          .map((r) => r.item as unknown as OwnedFrame | null)
          .filter((f): f is OwnedFrame => !!f && !!f.asset_url);
        setFrames(items);
        setLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function selectFrame(frameId: string | null) {
    setSaving(true);
    await supabase.from("personas").update({ avatar_frame_id: frameId }).eq("id", personaId);
    setSelected(frameId);
    setSaving(false);
  }

  if (!loaded) return <div className="h-4 w-32 animate-pulse rounded bg-muted" />;
  if (!frames.length) return (
    <p className="text-xs text-muted-foreground">Aucun cadre possédé. Achetez-en un dans la boutique.</p>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {/* Option "aucun cadre" */}
      <button
        type="button"
        disabled={saving}
        onClick={() => void selectFrame(null)}
        className={`relative h-14 w-14 rounded-xl border-2 bg-muted text-xs text-muted-foreground transition-colors ${
          selected === null ? "border-primary" : "border-transparent hover:border-border"
        }`}
        title="Aucun cadre"
      >
        <X className="m-auto h-5 w-5" />
        {selected === null && <Check className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground p-0.5" />}
      </button>

      {frames.map((f) => (
        <button
          key={f.id}
          type="button"
          disabled={saving}
          onClick={() => void selectFrame(f.id)}
          className={`relative h-14 w-14 rounded-xl border-2 overflow-hidden transition-colors ${
            selected === f.id ? "border-primary" : "border-transparent hover:border-border"
          }`}
          title={f.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.preview_url ?? f.asset_url ?? ""} alt={f.name} className="h-full w-full object-cover" />
          {selected === f.id && <Check className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground p-0.5" />}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

type PersonaEditSheetProps = {
  personaId: string;
  personaName: string;
  initialSections: PersonaSectionWithFields[];
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
  initialBannerUrl?: string | null;
  initialFrameId?: string | null;
  trigger?: ReactNode;
};

type PersonaEditorContentProps = {
  personaId: string;
  personaName: string;
  initialSections: PersonaSectionWithFields[];
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
  initialBannerUrl?: string | null;
  initialFrameId?: string | null;
};

// ---------------------------------------------------------------------------
// Contenu partagé éditeur
// ---------------------------------------------------------------------------

export function PersonaEditorContent({
  personaId,
  personaName,
  initialSections,
  initialAvatarUrl,
  initialAvatarConfig,
  initialBannerUrl,
  initialFrameId,
}: PersonaEditorContentProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl ?? null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfigV1 | null>(initialAvatarConfig ?? null);
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ xp: number; coins: number; streak_current: number } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const avatarFallback = useMemo(() => initials(personaName), [personaName]);

  // Récupère l'userId pour l'upload fichier + balance gamification
  useMemo(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setBalanceLoading(false); return; }
      const { data: bal } = await supabase
        .from("gamification_balances")
        .select("xp, coins, streak_current")
        .eq("user_id", uid)
        .maybeSingle();
      setBalance(bal ?? null);
      setBalanceLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function levelInfo(xp: number) {
    const level = Math.floor(xp / 100) + 1;
    const base = (level - 1) * 100;
    const progress = Math.min(100, Math.round(((xp - base) / 100) * 100));
    return { level, xpForNext: level * 100, progress };
  }
  const xpInfo = balance ? levelInfo(balance.xp) : null;

  return (
    <>
      {/* Header — même structure que le profil en lecture */}
      <div className="relative overflow-hidden">
        {/* Bannière cliquable */}
        <button
          type="button"
          onClick={() => setBannerDialogOpen(true)}
          className="group relative h-28 w-full block overflow-hidden focus-visible:outline-none"
          aria-label="Modifier la bannière"
          title="Modifier la bannière"
        >
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-muted/60 to-muted" />
          )}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/30 grid place-items-center">
            <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white">
              <Pencil className="h-3.5 w-3.5" />
              {bannerUrl ? "Modifier la bannière" : "Ajouter une bannière"}
            </span>
          </div>
        </button>

        <div className="px-4 pb-4 -mt-16">
          <div className="relative flex items-start gap-4">
            {/* Avatar cliquable */}
            <button
              type="button"
              onClick={() => setAvatarDialogOpen(true)}
              className="group relative h-32 w-32 rounded-2xl border-4 border-background bg-muted overflow-hidden shadow shrink-0 focus-visible:outline-none"
              aria-label="Modifier l'avatar"
              title="Modifier l'avatar"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full grid place-items-center text-lg font-semibold text-muted-foreground">
                  {avatarFallback}
                </div>
              )}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/30 grid place-items-center">
                <div className="text-xs text-white font-medium">Modifier</div>
              </div>
            </button>

            {/* Nom + stats (même layout que le profil) */}
            <div className="pb-1 min-w-0 flex-1">
              <div className="h-16 pb-2 mb-2 flex items-end">
                <input
                  defaultValue={personaName}
                  onBlur={async (e) => {
                    const newName = e.target.value.trim();
                    if (!newName || newName === personaName) return;
                    const { error } = await supabase.from("personas").update({ name: newName }).eq("id", personaId);
                    if (error) { e.target.value = personaName; return; }
                    router.refresh();
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  maxLength={40}
                  placeholder="Nom du personnage"
                  className="w-full text-xl font-semibold leading-tight bg-transparent outline-none border-none rounded px-1 -mx-1 hover:bg-muted/60 focus:bg-muted/60 focus:underline decoration-dotted underline-offset-4 placeholder:text-muted-foreground/40 transition-colors"
                />
              </div>

              {xpInfo && balance ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Niveau {xpInfo.level}</span>
                    <span>{balance.xp} / {xpInfo.xpForNext} XP</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${xpInfo.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs pt-0.5">
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Coins className="h-3.5 w-3.5" />
                      {balance.coins.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-orange-400">
                      <Flame className="h-3.5 w-3.5" />
                      {balance.streak_current} j.
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                      <Zap className="h-3.5 w-3.5" />
                      {balance.xp} XP
                    </span>
                  </div>
                </div>
              ) : balanceLoading ? (
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Dialog bannière */}
      {/* Sheet bannière */}
      <BannerSheet
        open={bannerDialogOpen}
        onOpenChange={setBannerDialogOpen}
        personaId={personaId}
        supabase={supabase}
        userId={userId}
        currentBannerUrl={bannerUrl}
        onSaved={setBannerUrl}
        onRemove={() => setBannerUrl(null)}
      />

      {/* Sheet apparence (avatar + cosmétiques) */}
      <Sheet open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-5xl flex flex-col p-0 gap-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-0 shrink-0">
            <SheetTitle>Apparence</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="avatar" className="flex flex-col flex-1 overflow-hidden mt-4">
            <div className="px-6 shrink-0">
              <TabsList>
                <TabsTrigger value="avatar">Avatar</TabsTrigger>
                <TabsTrigger value="cosmetics">Cosmétiques</TabsTrigger>
              </TabsList>
            </div>

            {/* ── Avatar ── */}
            <TabsContent value="avatar" className="flex-1 flex flex-col overflow-hidden mt-0">
              <Tabs defaultValue="builder" className="flex flex-col flex-1 overflow-hidden">
                <div className="px-6 pt-3 shrink-0">
                  <TabsList>
                    <TabsTrigger value="builder">Générateur</TabsTrigger>
                    <TabsTrigger value="upload">Depuis l'appareil</TabsTrigger>
                    <TabsTrigger value="url">URL externe</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="builder" className="flex-1 overflow-auto p-6 mt-0">
                  <PersonaAvatarPicker
                    personaId={personaId}
                    initialConfig={avatarConfig}
                    onSaved={(next) => {
                      setAvatarUrl(next.avatarUrl ?? null);
                      setAvatarConfig(next.config ?? null);
                      setAvatarDialogOpen(false);
                    }}
                  />
                </TabsContent>
                <TabsContent value="upload" className="p-6 mt-0">
                  <StorageUploadTab
                    personaId={personaId}
                    supabase={supabase}
                    userId={userId}
                    subfolder="avatars"
                    dbColumn="avatar_url"
                    extraUpdate={{ avatar_config: null }}
                    cropAspect={1}
                    onSaved={(url) => {
                      setAvatarUrl(url);
                      setAvatarConfig(null);
                      setAvatarDialogOpen(false);
                      router.refresh();
                    }}
                  />
                </TabsContent>
                <TabsContent value="url" className="p-6 mt-0">
                  <ExternalUrlTab
                    current={null}
                    onSaved={async (url) => {
                      await supabase.from("personas").update({ avatar_url: url, avatar_config: null }).eq("id", personaId);
                      setAvatarUrl(url);
                      setAvatarConfig(null);
                      setAvatarDialogOpen(false);
                      router.refresh();
                    }}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ── Cosmétiques ── */}
            <TabsContent value="cosmetics" className="flex-1 overflow-auto p-6 mt-0">
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium mb-3">Cadre d'avatar</p>
                  <FramePicker
                    personaId={personaId}
                    supabase={supabase}
                    userId={userId}
                    initialFrameId={initialFrameId ?? null}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Sections */}
      <div className="space-y-4">
        <PersonaSectionsTabs personaId={personaId} initialSections={initialSections} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sheet d'édition
// ---------------------------------------------------------------------------

export function PersonaEditSheet({
  personaId,
  personaName,
  initialSections,
  initialAvatarUrl,
  initialAvatarConfig,
  initialBannerUrl,
  initialFrameId,
  trigger,
}: PersonaEditSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger
        ? <span onClick={() => setOpen(true)} style={{ display: "contents" }}>{trigger}</span>
        : <button className="text-sm underline" onClick={() => setOpen(true)}>Éditer</button>
      }
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>Éditer — {personaName}</SheetTitle>
          </SheetHeader>
          <PersonaEditorContent
            personaId={personaId}
            personaName={personaName}
            initialSections={initialSections}
            initialAvatarUrl={initialAvatarUrl}
            initialAvatarConfig={initialAvatarConfig}
            initialBannerUrl={initialBannerUrl}
            initialFrameId={initialFrameId}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
