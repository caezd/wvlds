"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";
import { FIELD, SettingsChoiceCards, SettingsSection } from "./FeatureLayout";
import type { PersistField, WorldFormValues } from "./worldSettingsSchema";

type ProprietesOnglet = {
  world: World;
  form: UseFormReturn<WorldFormValues>;
  persistField: PersistField;
};

import { Camera, Globe, GlobeLock, Palette, Plus, ShieldAlert, Users, X } from "lucide-react";
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
/** Un monde ne porte pas plus de tags que cela. */
const MAX_TAGS = 10;

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

    /** Ce que l'on propose : affiné par la saisie, les plus portés sinon. */
    const suggestions = tags.length >= MAX_TAGS ? [] : newTag.trim() ? tagSuggestions : popularTags;

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
                            <>
                                <div className="space-y-6">
                                    {/* -- Visibilité ----------------------------- */}
                                    {/* Des cartes qui disent chacune ce qu'elles font, comme
                                        la visibilité d'un salon. */}
                                    <SettingsSection title={tSettings("visibility")}>
                                    <FormField
                                        control={form.control}
                                        name="visibility"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <SettingsChoiceCards
                                                        label={tSettings("visibility")}
                                                        value={[field.value]}
                                                        options={[
                                                            { value: "private", icon: GlobeLock, label: tSettings("private"), description: tSettings("privateDescription") },
                                                            { value: "public", icon: Globe, label: tSettings("public"), description: tSettings("publicDescription") },
                                                        ]}
                                                        onToggle={(v) => {
                                                            field.onChange(v);
                                                            void persistField("visibility", v);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    </SettingsSection>

                                    {/* -- Sécurité ----------------------------- */}
                                    <SettingsSection title={t("tabSecurity")}>
                                        <SettingsChoiceCards
                                            label={t("tabSecurity")}
                                            value={[ageRestricted ? "adults" : "all"]}
                                            disabled={togglingAgeRestricted}
                                            options={[
                                                { value: "all", icon: Users, label: tSettings("allAges"), description: tSettings("allAgesDescription") },
                                                { value: "adults", icon: ShieldAlert, label: tSettings("adultsOnly"), description: tSettings("ageRestrictedHelp") },
                                            ]}
                                            onToggle={(v) => void handleAgeRestrictedToggle(v === "adults")}
                                        />
                                    </SettingsSection>

                                    {/* -- Avatars acceptés --------------------- */}
                                    {/* Les deux styles ne s'excluent pas : deux cartes à bascule. */}
                                    <SettingsSection title={t("acceptedAvatarTypes")} description={tSettings("avatarTypesHelp")}>
                                        <SettingsChoiceCards
                                            multiple
                                            label={t("acceptedAvatarTypes")}
                                            value={[...(allowsRealAvatars ? ["real" as const] : []), ...(allowsIllustratedAvatars ? ["illustrated" as const] : [])]}
                                            disabled={togglingAvatarType}
                                            options={[
                                                { value: "real", icon: Camera, label: tSettings("avatarReal") },
                                                { value: "illustrated", icon: Palette, label: tSettings("avatarIllustrated") },
                                            ]}
                                            onToggle={(v) =>
                                                v === "real"
                                                    ? void handleAvatarTypeToggle("allows_real_avatars", !allowsRealAvatars)
                                                    : void handleAvatarTypeToggle("allows_illustrated_avatars", !allowsIllustratedAvatars)
                                            }
                                        />
                                    </SettingsSection>

                                    {/* -- Tags -------------------------------- */}
                                    {/* Un seul cadre pour ce qu'on a et ce qu'on tape, une ligne
                                        discrète pour ce qu'on propose : trois rangées de pastilles
                                        de formes différentes se lisaient comme un fourre-tout. */}
                                    <SettingsSection title={tSettings("tags")} description={tSettings("tagsHelp")} count={`${tags.length}/${MAX_TAGS}`}>
                                        <div className={cn("space-y-2 rounded-md border p-2", FIELD)}>
                                            {tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tags.map((tag) => (
                                                        <span
                                                            key={tag}
                                                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
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
                                            {tags.length < MAX_TAGS ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        value={newTag}
                                                        placeholder={t("addTagPlaceholder")}
                                                        className="h-8 flex-1 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
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
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        disabled={!newTag.trim() || savingTag}
                                                        aria-label={t("addTag")}
                                                        onClick={() => void handleAddTag()}
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <p className="px-1.5 py-1 text-xs-plus text-muted-foreground">
                                                    {tSettings("maxTags", { count: MAX_TAGS })}
                                                </p>
                                            )}
                                        </div>

                                        {/* Ce que l'on tape affine la liste ; sans rien de tapé, les
                                            tags les plus portés du site. Une seule rangée dans les
                                            deux cas, sous le même libellé. */}
                                        {suggestions.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                                <span className="text-xs-plus text-muted-foreground">{tSettings("popularTags")}</span>
                                                {suggestions.map((tag) => (
                                                    <button
                                                        key={tag}
                                                        type="button"
                                                        disabled={savingTag}
                                                        onClick={() => void handleAddTag(tag)}
                                                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                        {tag}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </SettingsSection>
                                </div>
                            </>
  );
}
