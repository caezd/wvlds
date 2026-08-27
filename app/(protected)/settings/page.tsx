import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getCurrentProfile } from "@/lib/currentRequest";
import { LocaleSelector } from "./LocaleSelector";
import { ProfileSettingsForm } from "./ProfileSettingsForm";
import { MessageFontSelector } from "./MessageFontSelector";
import { MessageTextSizeSelector } from "./MessageTextSizeSelector";
import { MessageTextAlignSelector } from "./MessageTextAlignSelector";
import { PatreonSection } from "./PatreonSection";
import { isPatreonEnabled, getPatreonMinCents } from "@/lib/patreon/config";

/** Titre d'onglet — sans lui la page héritait du « WVLDS » générique. */
export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const [t, currentLocale] = await Promise.all([
    getTranslations("settings"),
    getLocale(),
  ]);

  const supabase = await createClient();
  // messageFont/messageTextSize viennent du profil mémoïsé de la requête
  // (déjà résolu par le layout racine) — seuls bio/pronouns manquent et
  // nécessitent encore une requête dédiée (colonnes absentes de CurrentProfile).
  const userId = await getCurrentUserId();
  const profile = await getCurrentProfile();

  let bio = "";
  let pronouns: string[] = [];
  const messageFont = profile?.message_font ?? "sans";
  const messageTextSize = profile?.message_text_size ?? "base";
  const messageTextAlign = profile?.message_text_align ?? "left";
  if (userId) {
    const { data: extra } = await supabase
      .from("profiles")
      .select("bio,pronouns")
      .eq("id", userId)
      .maybeSingle();
    bio = extra?.bio ?? "";
    pronouns = extra?.pronouns ?? [];
  }

  // Statut Patreon (RLS : l'utilisateur ne lit que sa propre ligne, hors tokens).
  const patreonEnabled = isPatreonEnabled();
  let patreonLinked = false;
  let patronStatus: string | null = null;
  let entitledCents = 0;
  if (patreonEnabled && userId) {
    const { data: patreon } = await supabase
      .from("patreon_accounts")
      .select("patron_status,entitled_cents")
      .eq("user_id", userId)
      .maybeSingle();
    if (patreon) {
      patreonLinked = true;
      patronStatus = patreon.patron_status ?? null;
      entitledCents = patreon.entitled_cents ?? 0;
    }
  }
  const patreonMinCents = getPatreonMinCents();

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </header>

      <section className="rounded-lg border p-4 space-y-3">
        <div>
          <h2 className="font-medium">{t("profile.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("profile.description")}</p>
        </div>
        <ProfileSettingsForm initialBio={bio} initialPronouns={pronouns} />
      </section>

      {patreonEnabled && (
        <section className="rounded-lg border p-4 space-y-3">
          <div>
            <h2 className="font-medium">{t("subscription.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subscription.description")}</p>
          </div>
          <PatreonSection
            linked={patreonLinked}
            patronStatus={patronStatus}
            entitledCents={entitledCents}
            minCents={patreonMinCents}
            plan={profile?.plan ?? "free"}
            patreonUrl={process.env.NEXT_PUBLIC_PATREON_URL}
          />
        </section>
      )}

      <section className="rounded-lg border p-4 space-y-3">
        <div>
          <h2 className="font-medium">{t("language")}</h2>
          <p className="text-sm text-muted-foreground">{t("languageDescription")}</p>
        </div>
        <LocaleSelector currentLocale={currentLocale} />
      </section>

      <section className="rounded-lg border p-4 space-y-5">
        <div>
          <h2 className="font-medium">{t("accessibility.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("accessibility.description")}</p>
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">{t("font")}</h3>
            <p className="text-xs text-muted-foreground">{t("fontDescription")}</p>
          </div>
          <MessageFontSelector currentFont={messageFont} />
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">{t("textSize")}</h3>
            <p className="text-xs text-muted-foreground">{t("textSizeDescription")}</p>
          </div>
          <MessageTextSizeSelector currentSize={messageTextSize} />
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">{t("textAlign")}</h3>
            <p className="text-xs text-muted-foreground">{t("textAlignDescription")}</p>
          </div>
          <MessageTextAlignSelector currentAlign={messageTextAlign} />
        </div>
      </section>
    </div>
  );
}
