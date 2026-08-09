import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RetryButton } from "./RetryButton";

// Fallback précaché par le service worker (app/sw.ts) et servi pour toute
// navigation document qui échoue faute de réseau. Doit rester joignable sans
// session (voir l'exception dans lib/supabase/middleware.ts).
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <RetryButton />
    </div>
  );
}
