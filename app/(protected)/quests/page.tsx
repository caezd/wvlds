import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getCachedFeatureFlags } from "@/lib/currentRequest";
import { redirect } from "next/navigation";
import { RPC, TABLE } from "@/lib/constants";
import type { ActiveDailyChallenge, DailyChallengeJournalEntry } from "@/types/db";
import { pickRandomChallenge } from "@/lib/challengeTemplates";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { Dices, Trophy, Clock, Coins } from "lucide-react";
import DateDisplay from "@/components/date-display";
import { getTranslations } from "next-intl/server";

type TFn = Awaited<ReturnType<typeof getTranslations>>;

function ValidationHint({ validation, t }: { validation: ActiveDailyChallenge["validation"]; t: TFn }) {
  switch (validation.kind) {
    case "contains_word":
      return <span>{t("rules.includeWord")} <strong className="text-foreground">« {validation.value} »</strong> {t("rules.inMessage")}</span>;
    case "no_word":
      return <span>{t("rules.excludeWord")} <strong className="text-foreground">« {validation.value} »</strong></span>;
    case "word_count_range":
      return <span>{t("rules.lengthBetween")} <strong className="text-foreground">{validation.min}</strong> {t("rules.and")} <strong className="text-foreground">{validation.max}</strong> {t("rules.words")}</span>;
    case "starts_with":
      return <span>{t("rules.startWith")} <strong className="text-foreground">« {validation.value} »</strong></span>;
    case "ends_with_question":
      return <span>{t("rules.endQuestion")}</span>;
    case "no_adverb_ly":
      return <span>{t("rules.noAdverb")} <strong className="text-foreground">{t("rules.adverbSuffix")}</strong></span>;
    case "contains_regex":
      return <span>{t("rules.followPattern")}</span>;
  }
}

/** Titre d'onglet — sans lui la page héritait du « WVLDS » générique. */
export async function generateMetadata() {
  const t = await getTranslations("quests");
  return { title: t("title") };
}

export default async function QuestsPage() {
  // Ces quatre-là ne dépendent d'aucun des autres : ils partaient pourtant
  // l'un après l'autre, avant même la première requête métier de la page.
  const [t, supabase, userId, featureFlags] = await Promise.all([
    getTranslations("quests"),
    createClient(),
    getCurrentUserId(),
    getCachedFeatureFlags(),
  ]);
  if (!userId) redirect("/login");
  if (!featureFlags.quests) redirect("/");

  const today = new Date().toISOString().split("T")[0];

  // Crée le défi de l'utilisateur pour aujourd'hui s'il n'en a pas encore
  const { data: existing } = await supabase
    .from(TABLE.CHALLENGES)
    .select("id")
    .eq("active_date", today)
    .eq("user_id", userId)
    .is("world_id", null)
    .maybeSingle();

  if (!existing) {
    const template = pickRandomChallenge();
    await supabase.from(TABLE.CHALLENGES).insert({
      user_id: userId,
      world_id: null,
      active_date: today,
      title: template.title,
      description: template.description,
      validation: template.validation,
      reward_coins: template.reward_coins,
      reward_xp: template.reward_xp,
      min_word_count: template.min_word_count,
      source: "admin",
    });
  }

  const [
    { data: rawChallenges },
    { data: wonToday },
    { data: journal },
  ] = await Promise.all([
    supabase
      .from(TABLE.CHALLENGES)
      .select("id, title, description, validation, reward_coins, reward_xp, min_word_count, source, active_date")
      .eq("active_date", today)
      .eq("user_id", userId)
      .is("world_id", null),
    supabase
      .from(TABLE.CHALLENGE_ATTEMPTS)
      .select("challenge_id")
      .eq("user_id", userId)
      .eq("status", "won"),
    supabase.rpc(RPC.GET_DAILY_CHALLENGE_JOURNAL, { p_date: today }),
  ]);

  const wonIds = new Set((wonToday ?? []).map((a) => a.challenge_id));

  const challenges: ActiveDailyChallenge[] = (rawChallenges ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    validation: c.validation as ActiveDailyChallenge["validation"],
    reward_coins: c.reward_coins,
    reward_xp: c.reward_xp,
    min_word_count: c.min_word_count,
    active_date: c.active_date,
    source: c.source as ActiveDailyChallenge["source"],
    already_won: wonIds.has(c.id),
  }));

  const entries: DailyChallengeJournalEntry[] = (journal ?? []) as DailyChallengeJournalEntry[];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* En-tête */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Dices className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold">{t("title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Défis actifs */}
      {challenges.length === 0 ? (
        <div className="rounded-xl border border-border-soft bg-muted/30 px-5 py-8 text-center">
          <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {challenges.map((c) => (
            <div
              key={c.id}
              className={[
                "rounded-xl border px-5 py-4 space-y-3 transition-colors",
                c.already_won
                  ? "border-primary/30 bg-primary/5"
                  : "border-border-soft bg-background",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {c.already_won && <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="font-medium text-sm">{c.title}</span>
                    {c.source === "word_of_day" && (
                      <span className="text-[0.6rem] uppercase tracking-wider font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                        {t("todaysWord")}
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <MarkdownRenderer
                      content={c.description}
                      proseSize="sm"
                      className="text-muted-foreground"
                    />
                  )}
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <div className="flex items-center gap-1 justify-end text-xs font-medium text-amber-500">
                    <Coins className="h-3 w-3" />
                    <span>+{c.reward_coins}</span>
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">+{c.reward_xp} XP</div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-border-soft/60">
                <span className="text-xs text-muted-foreground">
                  <ValidationHint validation={c.validation} t={t} />
                </span>
                {c.min_word_count > 0 && (
                  <span className="ml-auto text-[0.65rem] text-muted-foreground/60 shrink-0">
                    min. {c.min_word_count} mots
                  </span>
                )}
              </div>

              {c.already_won && (
                <p className="text-xs text-primary font-medium">{t("completed")}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Journal du jour */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
          {t("victoriesTitle")}
        </h2>

        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 text-center py-4">
            {t("noVictories")}
          </p>
        ) : (
          <div className="rounded-xl border border-border-soft overflow-hidden divide-y divide-border-soft">
            {entries.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-3">
                <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                  <span className="text-muted-foreground/50">{t("playerCompleted")}</span>
                  {" · "}
                  <span className="text-foreground/80 font-medium">{e.challenge_title}</span>
                </p>
                <span className="text-[0.65rem] text-muted-foreground/60 shrink-0">
                  <DateDisplay value={e.won_at} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
