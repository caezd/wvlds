"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Megaphone, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { topic, useTopic } from "@/lib/realtimeHub";
import { dismissWorldBanner, fetchWorldBanners, type WorldBanner } from "@/lib/worldAnnouncements";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";

/**
 * Les bandeaux d'annonce du monde (migration 230), en tête de l'accueil :
 * chacun reste jusqu'à ce que le membre le ferme, qu'il expire ou qu'on le
 * retire. Un envoi ou un retrait arrive en direct (`world_banner` sur le
 * sujet personnel).
 */
export function WorldAnnouncementBanners({
  worldId,
  userId,
  className,
}: {
  worldId: string;
  userId: string | null;
  className?: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [banners, setBanners] = React.useState<WorldBanner[]>([]);

  const load = React.useCallback(async () => {
    setBanners(await fetchWorldBanners(supabase, worldId));
  }, [supabase, worldId]);

  React.useEffect(() => {
    if (!userId) return;
    void load();
  }, [load, userId]);

  useTopic(
    userId ? topic.user(userId) : null,
    ({ event, payload }) => {
      if (event === "world_banner" && (payload as { world_id?: string } | null)?.world_id === worldId) void load();
    },
    { onResync: () => void load() },
  );

  if (!userId || banners.length === 0) return null;

  function dismiss(id: string) {
    // Optimiste : un échec le fera revenir au prochain chargement.
    setBanners((prev) => prev.filter((b) => b.id !== id));
    void dismissWorldBanner(supabase, id);
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="world-banners">
      {banners.map((b) => (
        <BannerCard key={b.id} title={b.title} body={b.body} signer={b.signer} onDismiss={() => dismiss(b.id)} />
      ))}
    </div>
  );
}

/** Un bandeau ; sans `onDismiss`, c'est l'aperçu de l'onglet Annonces. */
export function BannerCard({
  title,
  body,
  signer,
  onDismiss,
  testId = "world-banner",
}: {
  title: string;
  body: string;
  signer: string | null;
  onDismiss?: () => void;
  testId?: string;
}) {
  const t = useTranslations("worlds.announcements");
  return (
    <section
      role="status"
      aria-label={title}
      data-testid={testId}
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground">
        <Megaphone className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {body ? (
          <div className="text-sm text-muted-foreground">
            <MarkdownRenderer content={body} />
          </div>
        ) : null}
        {signer ? <p className="text-xs-plus text-muted-foreground">{t("signedBy", { name: signer })}</p> : null}
      </div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label={t("bannerDismiss")}
          data-testid="world-banner-dismiss"
          className="-mr-1 -mt-1 shrink-0"
        >
          <X className="size-4" />
        </Button>
      )}
    </section>
  );
}
