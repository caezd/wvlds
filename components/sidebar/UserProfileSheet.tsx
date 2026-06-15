"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, KeyRound, Loader2 } from "lucide-react";
import { ImageCropPicker, getCroppedImg } from "@/components/ui/image-crop-picker";
import { toast } from "sonner";
import type { Area } from "react-easy-crop";

export function UserProfileSheet({
  open,
  onOpenChange,
  userId,
  initialUsername,
  initialAvatarUrl,
  email,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  initialUsername: string | null;
  initialAvatarUrl: string | null;
  email: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [username, setUsername] = useState(initialUsername ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [savingUsername, setSavingUsername] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUsername(initialUsername ?? "");
      setAvatarUrl(initialAvatarUrl);
    }
  }, [open, initialUsername, initialAvatarUrl]);

  const initials = (initialUsername || email).slice(0, 2).toUpperCase();

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed || trimmed === (initialUsername ?? "")) return;
    setSavingUsername(true);
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", userId);
    setSavingUsername(false);
    if (error) {
      const msg = error.message.toLowerCase().includes("unique")
        ? "Ce pseudo est déjà pris."
        : error.message;
      toast.error(msg);
    } else {
      toast.success("Pseudo mis à jour.");
      router.refresh();
    }
  }

  const handleAvatarFile = useCallback(
    async (rawFile: File) => {
      setUploadingAvatar(true);
      try {
        const file = await toWebP(rawFile);
        const path = `user-${userId}/profile.webp`;
        const { error: upErr } = await supabase.storage
          .from("personas")
          .upload(path, file, { upsert: true, contentType: "image/webp" });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("personas").getPublicUrl(path);
        const displayUrl = `${data.publicUrl}?t=${Date.now()}`;
        const { error: dbErr } = await supabase
          .from("profiles")
          .update({ avatar_url: displayUrl })
          .eq("id", userId);
        if (dbErr) throw dbErr;
        setAvatarUrl(displayUrl);
        toast.success("Avatar mis à jour.");
        router.refresh();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'upload.");
      } finally {
        setUploadingAvatar(false);
      }
    },
    [userId, supabase, router],
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCropSrc(URL.createObjectURL(f));
    e.target.value = "";
  }

  async function onCropConfirm(pixels: Area) {
    if (!cropSrc) return;
    setUploadingAvatar(true);
    try {
      const blob = await getCroppedImg(cropSrc, pixels);
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      await handleAvatarFile(new File([blob], "image.jpg", { type: "image/jpeg" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du recadrage.");
      setUploadingAvatar(false);
    }
  }

  function cancelCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  const usernameChanged = username.trim() !== (initialUsername ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b border-border-soft shrink-0">
          <SheetTitle>Mon profil</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {cropSrc ? (
            <div className="p-6">
              <ImageCropPicker
                src={cropSrc}
                aspect={1}
                uploading={uploadingAvatar}
                onConfirm={onCropConfirm}
                onCancel={cancelCrop}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-8 p-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="group relative h-24 w-24 overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Changer l'avatar"
                >
                  <Avatar className="h-full w-full">
                    <AvatarImage src={avatarUrl ?? undefined} alt={initialUsername ?? email} />
                    <AvatarFallback className="text-xl">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar
                      ? <Loader2 className="h-6 w-6 animate-spin text-white" />
                      : <Camera className="h-6 w-6 text-white" />
                    }
                  </div>
                </button>
                <p className="text-xs text-muted-foreground">Cliquez pour modifier l&apos;avatar</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>

              {/* Pseudo */}
              <form onSubmit={handleUsernameSubmit} className="space-y-2">
                <Label htmlFor="profile-username">Pseudo</Label>
                <div className="flex gap-2">
                  <Input
                    id="profile-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ton pseudo…"
                    maxLength={32}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={savingUsername || !username.trim() || !usernameChanged}
                  >
                    {savingUsername
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : "Enregistrer"
                    }
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        <SheetFooter className="shrink-0 border-t border-border-soft px-6 py-4 flex-row justify-start">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => router.push("/auth/update-password")}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Changer le mot de passe
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
