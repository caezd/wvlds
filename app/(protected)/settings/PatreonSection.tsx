"use client";

import { useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Heart, ExternalLink, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { disconnectPatreonAccount } from "./patreonActions";

type PatreonSectionProps = {
  linked: boolean;
  patronStatus: string | null;
  entitledCents: number;
  minCents: number;
  /** Plan courant — pour afficher le badge « Accès à vie » aux comptes lifetime. */
  plan: string;
  /** URL publique de la campagne Patreon (optionnelle). */
  patreonUrl?: string;
};

/** Mappe le paramètre ?patreon=… vers un toast. */
const TOAST_BY_STATUS: Record<string, { kind: "success" | "error" | "info"; key: string }> = {
  linked: { kind: "success", key: "toast.linked" },
  already_linked: { kind: "error", key: "toast.alreadyLinked" },
  cancelled: { kind: "info", key: "toast.cancelled" },
  error: { kind: "error", key: "toast.error" },
};

export function PatreonSection({
  linked,
  patronStatus,
  entitledCents,
  minCents,
  plan,
  patreonUrl,
}: PatreonSectionProps) {
  const t = useTranslations("settings.subscription");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const isLifetime = plan === "lifetime";
  const isActivePatron = patronStatus === "active_patron" && entitledCents >= minCents;

  // Toast au retour du flux OAuth, puis nettoyage de l'URL.
  const status = searchParams.get("patreon");
  useEffect(() => {
    if (!status) return;
    const entry = TOAST_BY_STATUS[status];
    if (entry) {
      const message = t(entry.key);
      if (entry.kind === "success") toast.success(message);
      else if (entry.kind === "error") toast.error(message);
      else toast(message);
    }
    router.replace("/settings");
  }, [status, t, router]);

  function handleDisconnect() {
    startTransition(async () => {
      const res = await disconnectPatreonAccount();
      if (res?.success) {
        toast.success(t("toast.disconnected"));
        router.refresh();
      } else {
        toast.error(t("toast.disconnectError"));
      }
    });
  }

  // ── Accès à vie : badge visible que le compte soit lié ou non ──
  if (isLifetime) {
    return (
      <div className="space-y-3">
        <Badge className="gap-1">
          <Crown className="size-3" />
          {t("lifetimeBadge")}
        </Badge>
        <p className="text-sm text-muted-foreground">{t("lifetimeMessage")}</p>
        {linked && (
          <div className="flex flex-wrap items-center gap-2">
            {patreonUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  {t("managePatreon")}
                </a>
              </Button>
            ) : null}
            <DeleteConfirmDialog
              title={t("disconnectTitle")}
              description={t("disconnectLifetimeDescription")}
              cancelLabel={t("cancel")}
              confirmLabel={t("disconnect")}
              onConfirm={handleDisconnect}
              trigger={
                <Button variant="ghost" size="sm" disabled={isPending}>
                  {t("disconnect")}
                </Button>
              }
            />
          </div>
        )}
      </div>
    );
  }

  // ── Non lié ──────────────────────────────────────────────
  if (!linked) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("notLinked")}</p>
        <Button asChild>
          <a href="/auth/patreon/connect">
            <Heart className="size-4" />
            {t("connect")}
          </a>
        </Button>
      </div>
    );
  }

  // ── Lié ──────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {isActivePatron ? (
          <Badge>{t("activeBadge")}</Badge>
        ) : (
          <Badge variant="secondary">{t("inactiveBadge")}</Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {isActivePatron ? t("linkedActive") : t("linkedInactive")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {patreonUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              {t("managePatreon")}
            </a>
          </Button>
        ) : null}

        <DeleteConfirmDialog
          title={t("disconnectTitle")}
          description={t("disconnectDescription")}
          cancelLabel={t("cancel")}
          confirmLabel={t("disconnect")}
          onConfirm={handleDisconnect}
          trigger={
            <Button variant="ghost" size="sm" disabled={isPending}>
              {t("disconnect")}
            </Button>
          }
        />
      </div>
    </div>
  );
}
