// components/personas/PersonaEditSheet.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toWebP } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TabBar } from "@/components/ui/tab-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Coins, Flame, ImagePlus, Loader2, Pencil, Trash2, X, Zap } from "lucide-react";
import type { Area } from "react-easy-crop";
import { ImageCropPicker, getCroppedImg } from "@/components/ui/image-crop-picker";

import { PersonaSectionsTabs } from "./PersonaSectionsTabs";
import type { PersonaSectionWithFields } from "@/types/personas";

import {
  PersonaAvatarPicker,
  type AvatarConfigV1,
} from "./avatar/PersonaAvatarPicker";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { deletePersona } from "@/app/(protected)/p/actions";
import { toast } from "sonner";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "P";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

// ---------------------------------------------------------------------------
// Onglet URL externe (partagé avatar + bannière)
// ---------------------------------------------------------------------------

function ExternalUrlTab({
  onSaved,
}: {
  current?: string | null;
  onSaved: (url: string) => void;
  aspect?: "square" | "wide";
}) {
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-muted-foreground">
        Colle l&apos;URL d&apos;une image hébergée (jpg, png, webp…).
      </p>
      <Input
        placeholder="https://example.com/image.jpg"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && url.trim() && onSaved(url.trim())}
      />
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (rawFile: File) => {
    if (!userId) { setError("Non connecté."); return; }
    setUploading(true);
    setError(null);
    const file = await toWebP(rawFile);
    const path = `user-${userId}/${subfolder}/${personaId}.webp`;
    const { error: upErr } = await supabase.storage
      .from("personas")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from("personas").getPublicUrl(path);
    const displayUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from("personas")
      .update({ [dbColumn]: displayUrl, ...extraUpdate })
      .eq("id", personaId);
    if (dbErr) { setError(dbErr.message); setUploading(false); return; }
    setUploading(false);
    onSaved(displayUrl);
  }, [userId, subfolder, personaId, supabase, dbColumn, extraUpdate, onSaved]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (cropAspect !== undefined) {
      setCropSrc(URL.createObjectURL(f));
    } else {
      void handleFile(f);
    }
    e.target.value = "";
  }

  async function onCropConfirm(pixels: Area) {
    if (!cropSrc) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await getCroppedImg(cropSrc, pixels);
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      await handleFile(new File([blob], "image.jpg", { type: "image/jpeg" }));
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
      <>
        <ImageCropPicker
          src={cropSrc}
          aspect={cropAspect}
          uploading={uploading}
          onConfirm={onCropConfirm}
          onCancel={cancelCrop}
        />
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </>
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
      <SheetContent side="right" className="w-full sm:max-w-[calc(48rem-24px)] lg:shadow-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Bannière du personnage</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-4 p-6">
          <Tabs defaultValue="upload">
            <TabBar className="-mx-6">
              <TabsTrigger value="upload">Depuis l&apos;appareil</TabsTrigger>
              <TabsTrigger value="url">URL externe</TabsTrigger>
            </TabBar>
            <TabsContent value="upload" className="mt-4">
              <StorageUploadTab
                personaId={personaId}
                supabase={supabase}
                userId={userId}
                subfolder="banners"
                dbColumn="banner_url"
                cropAspect={744 / 136}
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
        </div>
        {currentBannerUrl && (
          <SheetFooter className="border-t border-border-soft px-6 py-3 shrink-0 flex-row justify-start">
            <DeleteConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="inline-flex text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Supprimer la bannière
                </Button>
              }
              description="La bannière de ce personnage sera supprimée définitivement du stockage."
              onConfirm={async () => {
                const path = currentBannerUrl?.match(/\/object\/public\/personas\/([^?]+)/)?.[1];
                await supabase.from("personas").update({ banner_url: null }).eq("id", personaId);
                if (path) await supabase.storage.from("personas").remove([path]);
                onRemove();
                onOpenChange(false);
              }}
            />
          </SheetFooter>
        )}
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
  onFrameChange,
}: {
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  initialFrameId: string | null;
  onFrameChange?: (frameId: string | null, assetUrl: string | null) => void;
}) {
  const router = useRouter();
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
      .then((res: { data: Array<{ item: unknown }> | null }) => {
        const items = ((res.data ?? []) as Array<{ item: unknown }>)
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
    const assetUrl = frameId ? (frames.find((f) => f.id === frameId)?.asset_url ?? null) : null;
    onFrameChange?.(frameId, assetUrl);
    setSaving(false);
    router.refresh();
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
        className={`relative h-14 w-14 rounded-xl border-2 bg-muted text-xs text-muted-foreground transition-colors ${selected === null ? "border-primary" : "border-transparent hover:border-border"
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
          className={`relative h-14 w-14 rounded-xl border-2 overflow-hidden transition-colors ${selected === f.id ? "border-primary" : "border-transparent hover:border-border"
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
  initialFrameUrl?: string | null;
  trigger?: ReactNode;
};

type PersonaEditorContentProps = {
  personaId: string;
  personaName: string;
  sections: PersonaSectionWithFields[];
  onSectionsChange: (sections: PersonaSectionWithFields[]) => void;
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
  initialBannerUrl?: string | null;
  initialFrameId?: string | null;
  initialFrameUrl?: string | null;
  /** Notifie le parent quand la sheet Avatar s'ouvre/ferme (effet pile de cartes). */
  onAvatarOpenChange?: (open: boolean) => void;
  /** Notifie le parent quand la sheet Bannière s'ouvre/ferme (effet pile de cartes). */
  onBannerOpenChange?: (open: boolean) => void;
};

// ---------------------------------------------------------------------------
// Contenu partagé éditeur
// ---------------------------------------------------------------------------

export function PersonaEditorContent({
  personaId,
  personaName,
  sections,
  onSectionsChange,
  initialAvatarUrl,
  initialAvatarConfig,
  initialBannerUrl,
  initialFrameId,
  initialFrameUrl,
  onAvatarOpenChange,
  onBannerOpenChange,
}: PersonaEditorContentProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl ?? null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfigV1 | null>(initialAvatarConfig ?? null);
  const [frameUrl, setFrameUrl] = useState<string | null>(initialFrameUrl ?? null);
  const { avatar_builder } = useFeatureFlags();
  const [appearanceTab, setAppearanceTab] = useState<"avatar" | "cosmetics">("avatar");
  const [avatarSubTab, setAvatarSubTab] = useState<"builder" | "upload" | "url">(avatar_builder ? "builder" : "upload");
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ xp: number; coins: number; streak_current: number } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const avatarFallback = useMemo(() => initials(personaName), [personaName]);

  // Récupère l'userId pour l'upload fichier + balance gamification
  useMemo(() => {
    supabase.auth.getUser().then(async (res: { data: { user: { id: string } | null } }) => {
      const uid = res.data.user?.id ?? null;
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

  useEffect(() => {
    onAvatarOpenChange?.(avatarDialogOpen);
  }, [avatarDialogOpen, onAvatarOpenChange]);

  useEffect(() => {
    onBannerOpenChange?.(bannerDialogOpen);
  }, [bannerDialogOpen, onBannerOpenChange]);

  return (
    <>
      {/* Header — même structure que le profil en lecture */}
      <div className="relative">
        {/* Bannière cliquable */}
        <button
          type="button"
          onClick={() => setBannerDialogOpen(true)}
          className="group relative h-34 w-full block overflow-hidden focus-visible:outline-none"
          aria-label="Modifier la bannière"
          title="Modifier la bannière"
        >
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={supabaseThumb(bannerUrl, 880, 80, 272) ?? bannerUrl} onError={(e) => { e.currentTarget.src = bannerUrl!; e.currentTarget.onerror = null; }} alt="" className="h-full w-full object-cover" draggable={false} />
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

        <div className="px-6 pb-4 -mt-16">
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
        <SheetContent side="right" className="w-full sm:max-w-5xl lg:shadow-2xl flex flex-col p-0 gap-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-0 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 rounded-xl border bg-muted overflow-hidden lg:hidden">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full grid place-items-center text-sm font-semibold text-muted-foreground">
                    {avatarFallback}
                  </div>
                )}
              </div>
              <SheetTitle>Avatar</SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex flex-col flex-1 overflow-hidden mt-4">
            {/* Menus alignés côte à côte (sous-menu) */}
            <div className="px-6 pb-3 border-b border-border-soft shrink-0 flex items-center gap-3 flex-wrap">
              <Tabs value={appearanceTab} onValueChange={(v) => setAppearanceTab(v as "avatar" | "cosmetics")}>
                <TabsList>
                  <TabsTrigger value="avatar">Avatar</TabsTrigger>
                  <TabsTrigger value="cosmetics">Cosmétiques</TabsTrigger>
                </TabsList>
              </Tabs>

              {appearanceTab === "avatar" && (
                <>
                  <div className="h-6 w-px bg-border" />
                  <Tabs value={avatarSubTab} onValueChange={(v) => setAvatarSubTab(v as "builder" | "upload" | "url")}>
                    <TabsList>
                      {avatar_builder && <TabsTrigger value="builder">Générateur</TabsTrigger>}
                      <TabsTrigger value="upload">Depuis l&apos;appareil</TabsTrigger>
                      <TabsTrigger value="url">URL externe</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </>
              )}
            </div>

            {/* Contenu */}
            {appearanceTab === "avatar" ? (
              avatarSubTab === "builder" ? (
                <div className="flex-1 overflow-auto p-6">
                  <PersonaAvatarPicker
                    personaId={personaId}
                    initialConfig={avatarConfig}
                    onSaved={(next) => {
                      setAvatarUrl(next.avatarUrl ?? null);
                      setAvatarConfig(next.config ?? null);
                      setAvatarDialogOpen(false);
                    }}
                  />
                </div>
              ) : avatarSubTab === "upload" ? (
                <div className="flex-1 overflow-auto p-6">
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
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-6">
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
                </div>
              )
            ) : (
              <div className="flex-1 overflow-auto p-6">
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium mb-3">Cadre d&apos;avatar</p>
                    <FramePicker
                      personaId={personaId}
                      supabase={supabase}
                      userId={userId}
                      initialFrameId={initialFrameId ?? null}
                      onFrameChange={(_, assetUrl) => setFrameUrl(assetUrl)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {(avatarUrl || avatarConfig) && (
            <SheetFooter className="border-t border-border-soft px-6 py-3 shrink-0 flex-row justify-start">
              <DeleteConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="inline-flex text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Supprimer l&apos;avatar
                  </Button>
                }
                description="L'avatar de ce personnage sera supprimé définitivement du stockage."
                onConfirm={async () => {
                  const path = avatarUrl?.match(/\/object\/public\/personas\/([^?]+)/)?.[1];
                  await supabase.from("personas").update({ avatar_url: null, avatar_config: null }).eq("id", personaId);
                  if (path) await supabase.storage.from("personas").remove([path]);
                  setAvatarUrl(null);
                  setAvatarConfig(null);
                  setAvatarDialogOpen(false);
                  router.refresh();
                }}
              />
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* Aperçu de l'avatar actuel dans l'espace libre à gauche (desktop only).
          Porté vers document.body pour passer au-dessus de l'obfuscateur Radix. */}
      {avatarDialogOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="hidden lg:flex fixed inset-y-0 left-0 right-[64rem] z-[51] items-center justify-center p-10 pointer-events-none">
            <div className="flex flex-col items-center gap-4">
              <div className="h-64 w-64 overflow-hidden rounded-3xl border bg-muted shadow-2xl">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full grid place-items-center text-4xl font-semibold text-muted-foreground">
                    {avatarFallback}
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-white/80">Avatar actuel</p>
            </div>
          </div>,
          document.body,
        )}

      {/* Aperçu de la bannière actuelle dans l'espace libre à gauche (desktop only).
          Porté vers document.body pour passer au-dessus de l'obfuscateur Radix. */}
      {bannerDialogOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="hidden lg:flex fixed inset-y-0 left-0 right-[calc(48rem-24px)] z-[51] items-center justify-center p-10 pointer-events-none">
            <div className="flex w-full max-w-[520px] flex-col items-center gap-4">
              <div className="aspect-[744/136] w-full overflow-hidden rounded-xl bg-muted shadow-2xl">
                {bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={supabaseThumb(bannerUrl, 1040, 80, 190) ?? bannerUrl} onError={(e) => { e.currentTarget.src = bannerUrl!; e.currentTarget.onerror = null; }} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full bg-gradient-to-r from-muted/60 to-muted grid place-items-center text-sm font-medium text-muted-foreground">
                    Aucune bannière
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-white/80">Bannière actuelle</p>
            </div>
          </div>,
          document.body,
        )}

      {/* Sections */}
      <div className="space-y-4">
        <PersonaSectionsTabs
          personaId={personaId}
          userId={userId}
          sections={sections}
          onSectionsChange={onSectionsChange}
        />
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
  initialFrameUrl,
  trigger,
}: PersonaEditSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sections, setSections] = useState(initialSections);

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePersona(personaId);
    if (!result.ok) {
      toast.error("Erreur lors de la suppression", { description: result.error });
      setDeleting(false);
      return;
    }
    setOpen(false);
    toast.success(`${personaName} a été supprimé.`);
    router.refresh();
  }

  return (
    <>
      {trigger
        ? <span onClick={() => setOpen(true)} style={{ display: "contents" }}>{trigger}</span>
        : <button className="text-sm underline" onClick={() => setOpen(true)}>Éditer</button>
      }
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "w-full sm:max-w-3xl flex flex-col p-0",
            avatarOpen && "lg:-translate-x-[280px] lg:blur-[2px]",
            bannerOpen && "lg:blur-[2px]",
          )}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Éditer — {personaName}</SheetTitle>
          </SheetHeader>

          {/* Zone scrollable */}
          <div className="flex-1 overflow-y-auto">
            <PersonaEditorContent
              personaId={personaId}
              personaName={personaName}
              sections={sections}
              onSectionsChange={setSections}
              initialAvatarUrl={initialAvatarUrl}
              initialAvatarConfig={initialAvatarConfig}
              initialBannerUrl={initialBannerUrl}
              initialFrameId={initialFrameId}
              initialFrameUrl={initialFrameUrl}
              onAvatarOpenChange={setAvatarOpen}
              onBannerOpenChange={setBannerOpen}
            />
          </div>

          {/* Footer fixe en bas */}
          <SheetFooter className="border-t border-border-soft px-6 py-3 flex-row justify-start bg-background">
            <DeleteConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Supprimer ce personnage
                </Button>
              }
              description={`"${personaName}" sera supprimé définitivement, ainsi que son avatar, sa bannière et toutes ses images de section.`}
              onConfirm={handleDelete}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
