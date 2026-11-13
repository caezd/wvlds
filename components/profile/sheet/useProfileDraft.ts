"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { messageErreurAction } from "@/lib/actionErrors";
import { isPronounOption } from "@/lib/pronouns";
import { birthdayPartial, buildCardPatch, cardDraftFrom, sameCard, type CardDraft } from "@/lib/worldMemberCard";
import { useMyWorldCard, type MyWorldCard } from "@/hooks/useMyWorldCard";
import type { WorldMemberCardFields } from "@/lib/worldMembers";
import { updateProfileBioAndPronouns } from "@/app/(protected)/settings/actions";

/** Ce que tout le monde voit : la bio et les pronoms du compte. */
export type ProfileText = { bio: string; pronouns: string[] };

/** Les pronoms tels que l'onglet « Profil » les édite : les options, et « Autre ». */
export type PronounsDraft = { options: string[]; otherOn: boolean; other: string };

export function pronounsDraftFrom(pronouns: string[]): PronounsDraft {
  const other = pronouns.find((p) => !isPronounOption(p)) ?? "";
  return { options: pronouns.filter(isPronounOption), otherOn: other !== "", other };
}

/** La liste enregistrée : les options dans l'ordre, puis « Autre » s'il est rempli. */
export function pronounsOf(d: PronounsDraft): string[] {
  const other = d.otherOn ? d.other.trim() : "";
  return [...d.options, ...(other ? [other] : [])];
}

/** Combien de pronoms comptent dans le maximum : « Autre » coché compte, même vide. */
export function pronounsCount(d: PronounsDraft): number {
  return d.options.length + (d.otherOn ? 1 : 0);
}

/**
 * La carte que le brouillon édite : celle du monde courant quand on l'a prise,
 * avec sa version enregistrée. Elle ne suit le monde courant que sans
 * modification en cours ; sinon elle reste celle du monde où l'on écrivait.
 */
export type CardTarget = {
  worldId: string;
  worldName: string | null;
  initial: WorldMemberCardFields;
  saved: CardDraft;
  patch: MyWorldCard["patch"];
};

function cardTargetFrom(myCard: MyWorldCard | null): CardTarget | null {
  return myCard
    ? { worldId: myCard.worldId, worldName: myCard.worldName, initial: myCard.card, saved: cardDraftFrom(myCard.card), patch: myCard.patch }
    : null;
}

/**
 * Le brouillon unique de « Mon profil » : pseudo, bio et pronoms, carte du
 * monde courant. `save()` n'envoie que ce qui a changé, en parallèle ; ce qui
 * échoue garde ses modifications (et son toast), ce qui réussit devient la
 * nouvelle référence. L'avatar n'y passe pas : il s'enregistre tout de suite.
 */
export function useProfileDraft({
  open,
  userId,
  initialUsername,
}: {
  open: boolean;
  userId: string;
  initialUsername: string | null;
}) {
  const t = useTranslations("userProfile");
  const tCard = useTranslations("worlds.members.card");
  const tCommon = useTranslations("common");
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // Ma carte dans le monde où l'on se trouve (migration 177).
  const myCard = useMyWorldCard(userId);

  // ── Références enregistrées ──
  const [savedUsername, setSavedUsername] = useState(initialUsername ?? "");
  const [savedProfile, setSavedProfile] = useState<ProfileText | null>(null);
  const [cardTarget, setCardTarget] = useState<CardTarget | null>(null);

  // ── Brouillon ──
  const [username, setUsername] = useState(initialUsername ?? "");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState<PronounsDraft>({ options: [], otherOn: false, other: "" });
  const [card, setCard] = useState<CardDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // À chaque ouverture, on repart de ce qui est enregistré (pendant le rendu :
  // l'ouverture et le brouillon changent ensemble, sans image intermédiaire).
  // La bio et les pronoms sont relus : ils ont pu changer sur un autre appareil.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSavedUsername(initialUsername ?? "");
      setUsername(initialUsername ?? "");
      setSavedProfile(null);
      const target = cardTargetFrom(myCard);
      setCardTarget(target);
      setCard(target?.saved ?? null);
      setJustSaved(false);
    }
  }

  const dirtyCard = !!card && !!cardTarget && !sameCard(card, cardTarget.saved);
  // La carte arrive, change de monde ou vient d'être écrite : sans
  // modification en cours, le brouillon la reprend.
  if (!dirtyCard && (myCard?.worldId !== cardTarget?.worldId || myCard?.card !== cardTarget?.initial)) {
    const target = cardTargetFrom(myCard);
    setCardTarget(target);
    setCard(target?.saved ?? null);
  }

  // La bio et les pronoms, lus à chaque ouverture.
  useEffect(() => {
    if (!open || savedProfile) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from(TABLE.PROFILES).select("bio, pronouns").eq("id", userId).maybeSingle();
      if (cancelled) return;
      const row = data as { bio: string | null; pronouns: string[] | null } | null;
      const loaded = { bio: row?.bio ?? "", pronouns: row?.pronouns ?? [] };
      setSavedProfile(loaded);
      setBio(loaded.bio);
      setPronouns(pronounsDraftFrom(loaded.pronouns));
    })();
    return () => { cancelled = true; };
  }, [open, savedProfile, supabase, userId]);

  // « Enregistré » s'efface au bout de trois secondes.
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const trimmedUsername = username.trim();
  const dirtyUsername = trimmedUsername !== savedUsername;
  const dirtyText = !!savedProfile && (bio !== savedProfile.bio || pronounsOf(pronouns).join("\u0000") !== savedProfile.pronouns.join("\u0000"));
  const dirtyProfile = dirtyUsername || dirtyText;
  const dirty = dirtyProfile || dirtyCard;
  const invalid = trimmedUsername === "" || (!!card && birthdayPartial(card));

  async function save() {
    if (!dirty || invalid || saving) return;
    setSaving(true);
    const jobs: Promise<boolean>[] = [];

    if (dirtyUsername) {
      jobs.push((async () => {
        const { error } = await supabase.from(TABLE.PROFILES).update({ username: trimmedUsername }).eq("id", userId);
        if (error) {
          toast.error(error.message.toLowerCase().includes("unique") ? t("usernameTaken") : tCommon("saveError"));
          return false;
        }
        setSavedUsername(trimmedUsername);
        router.refresh();
        return true;
      })());
    }

    if (dirtyText) {
      const nextBio = bio;
      const nextPronouns = pronounsOf(pronouns);
      jobs.push((async () => {
        const result = await updateProfileBioAndPronouns(nextBio, nextPronouns);
        if (!result?.success) {
          toast.error(result?.error ? messageErreurAction(result.error, tCommon) : tCommon("saveError"));
          return false;
        }
        setSavedProfile({ bio: nextBio, pronouns: nextPronouns });
        return true;
      })());
    }

    if (dirtyCard && card && cardTarget) {
      const target = cardTarget;
      const patch = buildCardPatch(card, "self");
      jobs.push((async () => {
        const { error } = await supabase.from(TABLE.WORLD_MEMBERS).update(patch).eq("world_id", target.worldId).eq("user_id", userId);
        if (error) {
          toast.error(tCard("saveFailed"));
          return false;
        }
        // La carte écrite devient la référence, même si l'on a changé de
        // monde entre-temps ; le brouillon reprendra ensuite le monde courant.
        const initial = { ...target.initial, ...patch };
        setCardTarget((c) => (c?.worldId === target.worldId ? { ...c, initial, saved: cardDraftFrom(initial) } : c));
        target.patch(patch);
        return true;
      })());
    }

    const results = await Promise.allSettled(jobs);
    setSaving(false);
    if (results.every((r) => r.status === "fulfilled" && r.value)) {
      toast.success(tCommon("changesSaved"));
      setJustSaved(true);
    }
  }

  function reset() {
    setUsername(savedUsername);
    if (savedProfile) {
      setBio(savedProfile.bio);
      setPronouns(pronounsDraftFrom(savedProfile.pronouns));
    }
    setCard(cardTarget?.saved ?? null);
  }

  return {
    username, setUsername,
    bio, setBio,
    pronouns, setPronouns,
    profileLoaded: !!savedProfile,
    cardTarget,
    card,
    setCard: (patch: Partial<CardDraft>) => setCard((c) => (c ? { ...c, ...patch } : c)),
    dirty, dirtyProfile, dirtyCard, invalid, saving, justSaved,
    save, reset,
  };
}
