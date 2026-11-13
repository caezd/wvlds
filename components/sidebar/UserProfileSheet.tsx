"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { toWebP } from "@/lib/imageUtils";
import { isPronounOption } from "@/lib/pronouns";
import { Drawer, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProfileIdentity } from "@/components/profile/sheet/ProfileIdentity";
import { ProfileTab } from "@/components/profile/sheet/ProfileTab";
import { WorldCardTab } from "@/components/profile/sheet/WorldCardTab";
import { AccountTab } from "@/components/profile/sheet/AccountTab";
import { ProfileSaveBar } from "@/components/profile/sheet/ProfileSaveBar";
import { pronounsOf, useProfileDraft } from "@/components/profile/sheet/useProfileDraft";

type Tab = "profile" | "card" | "account";

/** Un point d'avertissement sur l'onglet qui garde des modifications non enregistrées. */
function DirtyDot({ show }: { show: boolean }) {
  return show ? <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle" /> : null;
}

/**
 * « Mon profil », ouvert depuis le menu principal : l'identité en tête
 * (avatar, pseudo, pronoms), puis trois onglets — le profil que tout le monde
 * voit, ma carte dans le monde courant, le compte. Une seule barre
 * d'enregistrement pour tout, sauf l'avatar qui part tout de suite.
 */
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
  const t = useTranslations("userProfile");
  const tNav = useTranslations("nav");
  const tSave = useTranslations("userProfile.save");
  const tPronouns = useTranslations("pronouns");
  const tCommon = useTranslations("common");
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const draft = useProfileDraft({ open, userId, initialUsername });
  // L'onglet « Ma carte » n'apparaît que dans un monde dont on est membre
  // (ou tant qu'une carte d'un autre monde garde des modifications).
  const { cardTarget } = draft;

  const [tab, setTab] = useState<Tab>("profile");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Chaque ouverture repart de l'onglet « Profil » et de l'avatar enregistré.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab("profile");
      setAvatarUrl(initialAvatarUrl);
    }
  }
  const currentTab: Tab = tab === "card" && !cardTarget ? "profile" : tab;

  // Fermer avec des modifications en cours demande confirmation.
  function requestOpenChange(next: boolean) {
    if (!next && draft.dirty) {
      setConfirmLeave(true);
      return;
    }
    onOpenChange(next);
  }

  // Ctrl/⌘ + S enregistre, tant que la fiche est ouverte. L'écouteur ne se
  // rattache qu'à l'ouverture : il appelle toujours le dernier `save`.
  const saveRef = useRef(draft.save);
  useEffect(() => {
    saveRef.current = draft.save;
  });
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleAvatarConfirm = useCallback(
    async (blob: Blob) => {
      setUploadingAvatar(true);
      try {
        const rawFile = new File([blob], "image.png", { type: blob.type || "image/png" });
        const file = await toWebP(rawFile);
        const path = `user-${userId}/profile.webp`;
        const { error: upErr } = await supabase.storage
          .from("personas")
          .upload(path, file, { upsert: true, contentType: "image/webp" });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("personas").getPublicUrl(path);
        const displayUrl = `${data.publicUrl}?t=${Date.now()}`;
        const { error: dbErr } = await supabase
          .from(TABLE.PROFILES)
          .update({ avatar_url: displayUrl })
          .eq("id", userId);
        if (dbErr) throw dbErr;
        setAvatarUrl(displayUrl);
        toast.success(t("avatarUpdated"));
        router.refresh();
      } catch (e: unknown) {
        // Pas `e.message` : texte brut de PostgreSQL, il nomme table et policy.
        console.error("[UserProfileSheet] envoi d'avatar", e);
        toast.error(tCommon("uploadError"));
      } finally {
        setUploadingAvatar(false);
      }
    },
    [userId, supabase, router, t, tCommon],
  );

  const shownPronouns = pronounsOf(draft.pronouns).map((p) => (isPronounOption(p) ? tPronouns(p) : p));

  return (
    <>
      <Drawer open={open} onOpenChange={requestOpenChange} swipeDirection="right">
        <SideSheetContent width="profile">
          <DrawerHeader className="h-14 shrink-0 flex-row items-center px-6 py-0">
            <DrawerTitle className="text-sm">{tNav("profile")}</DrawerTitle>
          </DrawerHeader>

          <ProfileIdentity
            avatarUrl={avatarUrl}
            uploadingAvatar={uploadingAvatar}
            onAvatarConfirm={handleAvatarConfirm}
            username={draft.username}
            onUsernameChange={draft.setUsername}
            pronounsLine={shownPronouns.length > 0 ? shownPronouns.join(" · ") : null}
          />

          <Tabs value={currentTab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabBar listClassName="gap-5">
              <TabBarTrigger value="profile">
                {t("tabs.profile")}
                <DirtyDot show={draft.dirtyProfile} />
              </TabBarTrigger>
              {cardTarget && (
                <TabBarTrigger value="card">
                  {t("tabs.card")}
                  {cardTarget.worldName && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{cardTarget.worldName}</span>}
                  <DirtyDot show={draft.dirtyCard} />
                </TabBarTrigger>
              )}
              <TabBarTrigger value="account">
                {t("tabs.account")}
              </TabBarTrigger>
            </TabBar>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <TabsContent value="profile" className="p-6">
                {draft.profileLoaded ? (
                  <ProfileTab
                    bio={draft.bio}
                    onBioChange={draft.setBio}
                    pronouns={draft.pronouns}
                    onPronounsChange={draft.setPronouns}
                  />
                ) : (
                  <div className="space-y-2" aria-hidden>
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
                  </div>
                )}
              </TabsContent>
              {cardTarget && draft.card && (
                <TabsContent value="card" className="p-6" data-testid="my-world-card">
                  <WorldCardTab
                    worldId={cardTarget.worldId}
                    worldName={cardTarget.worldName}
                    userId={userId}
                    initial={cardTarget.initial}
                    value={draft.card}
                    onChange={draft.setCard}
                  />
                </TabsContent>
              )}
              <TabsContent value="account" className="p-6">
                <AccountTab email={email} />
              </TabsContent>
            </div>
          </Tabs>

          <ProfileSaveBar
            dirty={draft.dirty}
            justSaved={draft.justSaved}
            saving={draft.saving}
            invalid={draft.invalid}
            onSave={() => void draft.save()}
            onReset={draft.reset}
          />
        </SideSheetContent>
      </Drawer>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tSave("leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tSave("leaveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tSave("stay")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                draft.reset();
                setConfirmLeave(false);
                onOpenChange(false);
              }}
            >
              {tSave("leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
