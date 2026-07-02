"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PRONOUN_OPTIONS,
  PRONOUNS_MAX_COUNT,
  PRONOUN_CUSTOM_MAX_LENGTH,
  isPronounOption,
} from "@/lib/pronouns";
import { updateProfileBioAndPronouns } from "./actions";

export function ProfileSettingsForm({
  initialBio,
  initialPronouns,
}: {
  initialBio: string;
  initialPronouns: string[];
}) {
  const t = useTranslations("settings.profile");
  const tPronouns = useTranslations("pronouns");
  const [isPending, startTransition] = useTransition();

  const [bio, setBio] = useState(initialBio);
  const [selected, setSelected] = useState<string[]>(
    initialPronouns.filter(isPronounOption),
  );
  const [customPronoun, setCustomPronoun] = useState(
    initialPronouns.find((p) => !isPronounOption(p)) ?? "",
  );

  const totalCount = selected.length + (customPronoun.trim() ? 1 : 0);

  function toggleOption(option: string) {
    setSelected((prev) => {
      if (prev.includes(option)) return prev.filter((o) => o !== option);
      if (totalCount >= PRONOUNS_MAX_COUNT) return prev;
      return [...prev, option];
    });
  }

  function handleSave() {
    const pronouns = [...selected, ...(customPronoun.trim() ? [customPronoun.trim()] : [])];
    startTransition(async () => {
      const result = await updateProfileBioAndPronouns(bio, pronouns);
      if (result?.success) toast.success(t("saved"));
      else if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="profile-bio" className="text-sm font-medium">
          {t("bioLabel")}
        </label>
        <Textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 500))}
          placeholder={t("bioPlaceholder")}
          maxLength={500}
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">{t("bioHint", { count: bio.length })}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("pronounsLabel")}</label>
        <p className="text-xs text-muted-foreground">{t("pronounsHint")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {PRONOUN_OPTIONS.map((option) => {
            const active = selected.includes(option);
            const disabled = !active && totalCount >= PRONOUNS_MAX_COUNT;
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => toggleOption(option)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border-soft text-muted-foreground hover:text-foreground",
                  disabled && "opacity-40 cursor-not-allowed hover:text-muted-foreground",
                )}
              >
                {tPronouns(option)}
              </button>
            );
          })}
        </div>
        <div className="pt-1">
          <label htmlFor="profile-pronouns-custom" className="text-xs text-muted-foreground">
            {t("pronounsCustomLabel")}
          </label>
          <Input
            id="profile-pronouns-custom"
            value={customPronoun}
            onChange={(e) => setCustomPronoun(e.target.value.slice(0, PRONOUN_CUSTOM_MAX_LENGTH))}
            placeholder={t("pronounsCustomPlaceholder")}
            maxLength={PRONOUN_CUSTOM_MAX_LENGTH}
            disabled={!customPronoun && selected.length >= PRONOUNS_MAX_COUNT}
            className="mt-1 max-w-xs"
          />
        </div>
      </div>

      <Button type="button" onClick={handleSave} disabled={isPending}>
        {t("save")}
      </Button>
    </div>
  );
}
