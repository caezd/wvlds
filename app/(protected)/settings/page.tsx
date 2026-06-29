import { getTranslations, getLocale } from "next-intl/server";
import { LocaleSelector } from "./LocaleSelector";

export default async function SettingsPage() {
  const [t, currentLocale] = await Promise.all([
    getTranslations("settings"),
    getLocale(),
  ]);

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </header>

      <section className="rounded-lg border p-4 space-y-3">
        <div>
          <h2 className="font-medium">{t("language")}</h2>
          <p className="text-sm text-muted-foreground">{t("languageDescription")}</p>
        </div>
        <LocaleSelector currentLocale={currentLocale} />
      </section>
    </div>
  );
}
