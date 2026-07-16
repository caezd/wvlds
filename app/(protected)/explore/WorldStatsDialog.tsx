"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Camera, MessageSquare, Palette, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AgeConfirmDialog } from "@/components/worlds/AgeConfirmDialog";
import { JoinWorldButton } from "./JoinWorldButton";
import { useJoinWorld } from "./useJoinWorld";
import type { PublicWorld } from "./ExploreWorldCard";

type WorldStats = {
  message_count: number;
  member_count: number;
  persona_count: number;
};

export function WorldStatsDialog({
  world,
  tags,
  open,
  onOpenChange,
}: {
  world: PublicWorld;
  tags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("explore");
  const [stats, setStats] = useState<WorldStats | null>(null);
  const [loading, setLoading] = useState(false);
  const { join } = useJoinWorld(world.id);
  const [ageConfirmOpen, setAgeConfirmOpen] = useState(false);

  // Un seul aller-retour, uniquement à l'ouverture, et mis en cache pour
  // le reste de la session : évite de charger des stats pour les ~16
  // mondes de la page si l'utilisateur ne clique jamais dessus.
  useEffect(() => {
    if (!open || stats) return;
    const supabase = createClient();
    setLoading(true);
    supabase
      .rpc("get_world_public_stats", { p_world_id: world.id })
      .then(({ data }: { data: WorldStats | null }) => {
        setStats(data ?? { message_count: 0, member_count: 0, persona_count: 0 });
      })
      .finally(() => setLoading(false));
  }, [open, stats, world.id]);

  const hasAvatarType = world.allows_real_avatars || world.allows_illustrated_avatars;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden border-border-soft p-0">
          <DialogTitle className="sr-only">{world.name}</DialogTitle>

          <div
            className="relative isolate overflow-hidden p-6"
            style={{
              backgroundColor: world.banner_url ? undefined : (world.color ?? undefined),
              minHeight: 180,
            }}
          >
            {world.banner_url && (
              <Image src={world.banner_url} alt="" fill sizes="384px" className="object-cover" />
            )}
            <div
              className={
                world.banner_url
                  ? "absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/0"
                  : world.color
                    ? "absolute inset-0 bg-black/20"
                    : "absolute inset-0 bg-gradient-to-br from-card to-card-400"
              }
            />
            <div className="relative flex min-h-28 flex-col justify-end gap-1.5">
              {world.icon_url && (
                <Image
                  src={world.icon_url}
                  alt=""
                  width={40}
                  height={40}
                  className="mb-1 h-10 w-10 rounded-xl object-cover shadow"
                />
              )}
              <h2 className="text-xl font-bold text-white drop-shadow">{world.name}</h2>
              {world.description ? (
                <p className="line-clamp-2 text-sm text-white/80">{world.description}</p>
              ) : (
                <p className="text-sm italic text-white/50">{t("noDescription")}</p>
              )}

              {(tags.length > 0 || hasAvatarType || world.is_age_restricted) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                  {world.allows_real_avatars && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                      <Camera className="h-2.5 w-2.5" />
                      {t("avatarReal")}
                    </span>
                  )}
                  {world.allows_illustrated_avatars && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                      <Palette className="h-2.5 w-2.5" />
                      {t("avatarIllustrated")}
                    </span>
                  )}
                  {world.is_age_restricted && (
                    <span className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
                      {t("ageRestrictedBadge")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 p-4">
            <StatTile
              icon={<MessageSquare className="h-4 w-4" />}
              value={stats?.message_count}
              loading={loading}
              label={t("statsMessages")}
            />
            <StatTile
              icon={<Users className="h-4 w-4" />}
              value={stats?.member_count}
              loading={loading}
              label={t("statsMembers")}
            />
            <StatTile
              icon={<UserRound className="h-4 w-4" />}
              value={stats?.persona_count}
              loading={loading}
              label={t("statsPersonas")}
            />
          </div>

          <div className="px-4 pb-4">
            <JoinWorldButton
              worldId={world.id}
              worldName={world.name}
              ageRestricted={!!world.is_age_restricted}
              onRequestAgeConfirm={() => {
                onOpenChange(false);
                setAgeConfirmOpen(true);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Sibling du Dialog ci-dessus (pas un enfant) : fermer la stats
          dialog ne doit pas démonter cette confirmation. */}
      {world.is_age_restricted && (
        <AgeConfirmDialog
          worldName={world.name}
          open={ageConfirmOpen}
          onOpenChange={setAgeConfirmOpen}
          onConfirm={() => {
            setAgeConfirmOpen(false);
            join(true);
          }}
        />
      )}
    </>
  );
}

function StatTile({
  icon,
  value,
  loading,
  label,
}: {
  icon: ReactNode;
  value?: number;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-muted/30 py-3 text-center">
      <span className="text-muted-foreground">{icon}</span>
      {loading ? (
        <span className="h-5 w-8 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-base font-bold tabular-nums">{value ?? 0}</span>
      )}
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
