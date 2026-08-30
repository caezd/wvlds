import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("auth");
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <MailCheck className="h-8 w-8" />
          <h1 className="text-2xl font-bold">{t("checkInbox")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("checkInboxDescription")}
          </p>
        </div>
      </div>
    </div>
  );
}
