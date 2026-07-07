import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getCurrentProfile } from "@/lib/currentRequest";
import { LocaleSelector } from "./LocaleSelector";
import { ProfileSettingsForm } from "./ProfileSettingsForm";
import { MessageFontSelector } from "./MessageFontSelector";
import { MessageTextSizeSelector } from "./MessageTextSizeSelector";

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
  if (userId) {
    const { data: extra } = await supabase
      .from("profiles")
      .select("bio,pronouns")
      .eq("id", userId)
      .maybeSingle();
    bio = extra?.bio ?? "";
    pronouns = extra?.pronouns ?? [];
  }

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

      <section className="rounded-lg border p-4 space-y-3">
        <div>
          <h2 className="font-medium">{t("language")}</h2>
          <p className="text-sm text-muted-foreground">{t("languageDescription")}</p>
        </div>
        <LocaleSelector currentLocale={currentLocale} />
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <div>
          <h2 className="font-medium">{t("font")}</h2>
          <p className="text-sm text-muted-foreground">{t("fontDescription")}</p>
        </div>
        <MessageFontSelector currentFont={messageFont} />
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <div>
          <h2 className="font-medium">{t("textSize")}</h2>
          <p className="text-sm text-muted-foreground">{t("textSizeDescription")}</p>
        </div>
        <MessageTextSizeSelector currentSize={messageTextSize} />
      </section>
    </div>
  );
}
