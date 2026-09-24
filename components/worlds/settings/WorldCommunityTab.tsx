"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { TabsContent } from "@/components/ui/tabs";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";
import { LabelWithHelp } from "./LabelWithHelp";
import type { PersistField, WorldFormValues } from "./worldSettingsSchema";

type ProprietesOnglet = {
  world: World;
  form: UseFormReturn<WorldFormValues>;
  persistField: PersistField;
};

import { Camera, Globe, GlobeLock, Palette, Plus, ShieldAlert, Users, X, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  setWorldAgeRestricted,
  setWorldAvatarType,
  getWorldTags,
  addWorldTag,
  removeWorldTag,
} from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";

/**
 * Onglet « Communauté » des réglages d'un monde : visibilité, types d'avatars
 * autorisés, étiquettes.
 *
 * Même principe que l'onglet Fonctions — l'état vit ici, pas chez le parent —
 * et même montage par `key={world.id}`.
 */
/**
 * Deux choix dans un rail bordé, comme les onglets : le segment retenu se
 * remplit de la couleur d'accent, l'autre reste en retrait.
 *
 * `pressed` plutôt que `checked` : les avatars acceptés ne s'excluent pas —
 * un monde peut prendre les deux styles, donc les deux segments allumés.
 */
function SegmentedRail({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex w-full items-center gap-1 rounded-lg border border-border p-[3px]">{children}</div>
  );
}

function Segment({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export function WorldCommunityTab({ world, form, persistField, onUpdated }: ProprietesOnglet & {
  onUpdated?: (world: World) => void;
}) {
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const tCommun = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);

    const [allowsRealAvatars, setAllowsRealAvatars] = React.useState(world.allows_real_avatars === true);
    const [allowsIllustratedAvatars, setAllowsIllustratedAvatars] = React.useState(world.allows_illustrated_avatars === true);
    const [togglingAvatarType, setTogglingAvatarType] = React.useState(false);

    const [ageRestricted, setAgeRestricted] = React.useState(world.is_age_restricted === true);
    const [togglingAgeRestricted, setTogglingAgeRestricted] = React.useState(false);

    const [tags, setTags] = React.useState<string[]>([]);
    const [newTag, setNewTag] = React.useState("");
    const [savingTag, setSavingTag] = React.useState(false);
    const [existingTags, setExistingTags] = React.useState<string[]>([]);

    async function handleAgeRestrictedToggle(enabled: boolean) {
        setTogglingAgeRestricted(true);
        const res = await setWorldAgeRestricted(world.id, enabled);
        setTogglingAgeRestricted(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommun)); return; }
        setAgeRestricted(enabled);
        onUpdated?.({ ...world, is_age_restricted: enabled } as World);
    }

    async function handleAvatarTypeToggle(
        field: "allows_real_avatars" | "allows_illustrated_avatars",
        enabled: boolean,
    ) {
        setTogglingAvatarType(true);
        const res = await setWorldAvatarType(world.id, field, enabled);
        setTogglingAvatarType(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommun)); return; }
        if (field === "allows_real_avatars") setAllowsRealAvatars(enabled);
        else setAllowsIllustratedAvatars(enabled);
        onUpdated?.({ ...world, [field]: enabled } as World);
    }

    async function handleAddTag(tagOverride?: string) {
        const value = (tagOverride ?? newTag).trim();
        if (!value) return;
        setSavingTag(true);
        const res = await addWorldTag(world.id, value);
        setSavingTag(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommun)); return; }
        setTags((prev) => (prev.includes(res.tag) ? prev : [...prev, res.tag]));
        setExistingTags((prev) => (prev.includes(res.tag) ? prev : [...prev, res.tag]));
        setNewTag("");
    }

    const tagSuggestions = React.useMemo(() => {
        const query = newTag.trim().toLowerCase();
        if (!query) return [];
        return existingTags
            .filter((t) => t !== query && t.includes(query) && !tags.includes(t))
            .slice(0, 6);
    }, [newTag, existingTags, tags]);

    // existingTags est déjà trié par popularité (get_public_world_tags) — les 6
    // premiers non encore ajoutés à ce monde suffisent.
    const popularTags = React.useMemo(
        () => existingTags.filter((t) => !tags.includes(t)).slice(0, 6),
        [existingTags, tags],
    );

    async function handleRemoveTag(tag: string) {
        setTags((prev) => prev.filter((t) => t !== tag));
        const res = await removeWorldTag(world.id, tag);
        if (!res.ok) {
            toast.error(messageErreurAction(res.error, tCommun));
            setTags((prev) => [...prev, tag]);
        }
    }


    React.useEffect(() => {
        let cancelled = false;
        setTags([]);
        void getWorldTags(world.id).then((res) => {
            if (cancelled) return;
            if (res.ok) setTags(res.tags.map((t) => t.tag));
        });
        return () => { cancelled = true; };
    }, [world?.id]);

    // Tags déjà utilisés ailleurs (mondes publics) — sert de source pour les
    // suggestions affichées pendant la saisie, indépendant du monde courant.
    React.useEffect(() => {
        let cancelled = false;
        void supabase
            .rpc("get_public_world_tags")
            .then(({ data }: { data: { tag: string; world_count: number }[] | null }) => {
                if (cancelled) return;
                setExistingTags((data ?? []).map((t) => t.tag));
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  return (
                            <TabsContent value="community" className="mt-0">
                                <div className="mx-auto max-w-xl space-y-6">
                                    {/* -- Visibilité ----------------------------- */}
                                    <FormField
                                        control={form.control}
                                        name="visibility"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    <LabelWithHelp help={t("publicWorldHelp")}>
                                                        {tSettings("visibility")}
                                                    </LabelWithHelp>
                                                </FormLabel>
                                                <FormControl>
                                                    <SegmentedRail>
                                                        <Segment
                                                            active={field.value === "private"}
                                                            icon={GlobeLock}
                                                            label={tSettings("private")}
                                                            onClick={() => {
                                                                field.onChange("private");
                                                                void persistField("visibility", "private");
                                                            }}
                                                        />
                                                        <Segment
                                                            active={field.value === "public"}
                                                            icon={Globe}
                                                            label={tSettings("public")}
                                                            onClick={() => {
                                                                field.onChange("public");
                                                                void persistField("visibility", "public");
                                                            }}
                                                        />
                                                    </SegmentedRail>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* -- Sécurité ----------------------------- */}
                                    {/* Deux cartes plutôt qu'un interrupteur : le choix se lit
                                        d'un coup d'œil, comme Privé / Public juste au-dessus. */}
                                    <div className="space-y-3">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{t("tabSecurity")}</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                {tSettings("ageRestrictedHelp")}
                                            </p>
                                        </div>
                                        <SegmentedRail>
                                            <Segment
                                                active={!ageRestricted}
                                                disabled={togglingAgeRestricted}
                                                icon={Users}
                                                label={tSettings("allAges")}
                                                onClick={() => void handleAgeRestrictedToggle(false)}
                                            />
                                            <Segment
                                                active={ageRestricted}
                                                disabled={togglingAgeRestricted}
                                                icon={ShieldAlert}
                                                label={tSettings("adultsOnly")}
                                                onClick={() => void handleAgeRestrictedToggle(true)}
                                            />
                                        </SegmentedRail>
                                    </div>

                                    {/* -- Avatars acceptés --------------------- */}
                                    <div className="space-y-3">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{t("acceptedAvatarTypes")}</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                {tSettings("avatarTypesHelp")}
                                            </p>
                                        </div>
                                        <SegmentedRail>
                                            <Segment
                                                active={allowsRealAvatars}
                                                disabled={togglingAvatarType}
                                                icon={Camera}
                                                label={tSettings("avatarReal")}
                                                onClick={() => void handleAvatarTypeToggle("allows_real_avatars", !allowsRealAvatars)}
                                            />
                                            <Segment
                                                active={allowsIllustratedAvatars}
                                                disabled={togglingAvatarType}
                                                icon={Palette}
                                                label={tSettings("avatarIllustrated")}
                                                onClick={() => void handleAvatarTypeToggle("allows_illustrated_avatars", !allowsIllustratedAvatars)}
                                            />
                                        </SegmentedRail>
                                    </div>

                                    {/* -- Tags -------------------------------- */}
                                    <div className="space-y-3">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{tSettings("tags")}</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                {tSettings("tagsHelp")}
                                            </p>
                                        </div>
                                        {tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-muted/40 px-2.5 py-1 text-xs"
                                                    >
                                                        {tag}
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleRemoveTag(tag)}
                                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                                            aria-label={tSettings("removeTag", { tag })}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {tags.length < 10 && !newTag.trim() && popularTags.length > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-medium text-muted-foreground">{tSettings("popularTags")}</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {popularTags.map((tag) => (
                                                        <button
                                                            key={tag}
                                                            type="button"
                                                            disabled={savingTag}
                                                            onClick={() => void handleAddTag(tag)}
                                                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-soft px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                            {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {tags.length < 10 && (
                                            <div className="space-y-1.5">
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={newTag}
                                                        placeholder={t("addTagPlaceholder")}
                                                        className="h-8 text-sm"
                                                        maxLength={24}
                                                        disabled={savingTag}
                                                        onChange={(e) => setNewTag(e.target.value.replace(/[^\p{L}\p{N}]/gu, ""))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " " || e.key === ",") {
                                                                e.preventDefault();
                                                                void handleAddTag();
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        disabled={!newTag.trim() || savingTag}
                                                        aria-label={t("addTag")}
                                                        onClick={() => void handleAddTag()}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                {tagSuggestions.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {tagSuggestions.map((tag) => (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                disabled={savingTag}
                                                                onClick={() => void handleAddTag(tag)}
                                                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-soft px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                                {tag}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {tags.length >= 10 && (
                                            <p className="text-[11px] text-muted-foreground">{tSettings("maxTags", { count: 10 })}</p>
                                        )}
                                    </div>

                                </div>
                            </TabsContent>
  );
}
