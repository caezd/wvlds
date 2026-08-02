import { ChangelogFilters } from "./ChangelogFilters";
import { getTranslations } from "next-intl/server";

export default async function ChangelogPage() {
  const t = await getTranslations("changelog");
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 sm:space-y-8">
      <header className="space-y-1 pb-2 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>
      <ChangelogFilters />
    </div>
  );
}
