"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRONOUN_CUSTOM_MAX_LENGTH, PRONOUN_OPTIONS, PRONOUNS_MAX_COUNT } from "@/lib/pronouns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { pronounsCount, type PronounsDraft } from "./useProfileDraft";

const BIO_MAX = 500;

/** Une puce de pronom : carrée, cochée quand elle est choisie. */
function PronounChip({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        active ? "border-ring bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
      )}
    >
      {active && <Check className="h-[11px] w-[11px]" aria-hidden />}
      {label}
    </button>
  );
}

/**
 * L'onglet « Profil » : la bio et les pronoms du compte, ce que tout le monde
 * voit. Contrôlé : la barre d'enregistrement de la fiche écrit tout d'un coup.
 */
export function ProfileTab({
  bio,
  onBioChange,
  pronouns,
  onPronounsChange,
}: {
  bio: string;
  onBioChange: (value: string) => void;
  pronouns: PronounsDraft;
  onPronounsChange: (value: PronounsDraft) => void;
}) {
  const t = useTranslations("userProfile");
  const tPronouns = useTranslations("pronouns");
  const count = pronounsCount(pronouns);
  const full = count >= PRONOUNS_MAX_COUNT;

  function toggle(option: string) {
    const on = pronouns.options.includes(option);
    onPronounsChange({ ...pronouns, options: on ? pronouns.options.filter((o) => o !== option) : [...pronouns.options, option] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <label htmlFor="profile-bio" className="flex-1 text-sm font-medium">{t("bioLabel")}</label>
          <span className="text-xs-plus tabular-nums text-muted-foreground">{bio.length} / {BIO_MAX}</span>
        </div>
        <Textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => onBioChange(e.target.value.slice(0, BIO_MAX))}
          placeholder={t("bioPlaceholder")}
          maxLength={BIO_MAX}
          rows={4}
          className="resize-y"
        />
        <p className="text-xs text-muted-foreground">{t("bioVisibility")}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span id="profile-pronouns" className="flex-1 text-sm font-medium">{t("pronounsLabel")}</span>
          <span className="text-xs-plus tabular-nums text-muted-foreground">{count} / {PRONOUNS_MAX_COUNT}</span>
        </div>
        <div role="group" aria-labelledby="profile-pronouns" className="flex flex-wrap gap-1.5">
          {PRONOUN_OPTIONS.map((option) => {
            const active = pronouns.options.includes(option);
            return <PronounChip key={option} label={tPronouns(option)} active={active} disabled={!active && full} onClick={() => toggle(option)} />;
          })}
          {/* « Autre » : une puce qui compte dans le maximum ; la décocher vide son champ. */}
          <PronounChip
            label={t("pronounsCustomLabel")}
            active={pronouns.otherOn}
            disabled={!pronouns.otherOn && full}
            onClick={() => onPronounsChange(pronouns.otherOn ? { ...pronouns, otherOn: false, other: "" } : { ...pronouns, otherOn: true })}
          />
        </div>
        {pronouns.otherOn && (
          <Input
            aria-label={t("pronounsCustomLabel")}
            value={pronouns.other}
            onChange={(e) => onPronounsChange({ ...pronouns, other: e.target.value.slice(0, PRONOUN_CUSTOM_MAX_LENGTH) })}
            placeholder={t("pronounsCustomPlaceholder")}
            maxLength={PRONOUN_CUSTOM_MAX_LENGTH}
            className="h-8 max-w-[220px] text-xs"
            autoFocus
          />
        )}
      </div>
    </div>
  );
}
