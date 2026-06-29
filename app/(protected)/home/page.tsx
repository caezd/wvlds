import { createClient } from "@/lib/supabase/server";
import { getUserQuotaServer } from "@/lib/userQuota";
import Link from "next/link";
import { Globe, GlobeLock } from "lucide-react";
import { CreateWorldButton } from "./CreateWorldButton";
import { Hint } from "@/components/ui/hint";
import { getTranslations } from "next-intl/server";

type WorldCard = {
  id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  color: string | null;
  owner_id: string;
  world_members: { user_id: string; role: string }[];
};

export default async function HomePage() {
  const t = await getTranslations("home");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { plan, owned, quotaLimit, quotaReached } = await getUserQuotaServer("worlds");

  const { data: worlds } = await supabase
    .from("worlds")
    .select("id, name, description, banner_url, icon_url, color, owner_id, world_members(user_id, role)")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  const allWorlds = (worlds ?? []) as WorldCard[];

  const mine = allWorlds.filter((w) =>
    w.world_members.some((m) => m.user_id === user.id && m.role === "owner")
  );
  const shared = allWorlds.filter((w) =>
    w.world_members.some((m) => m.user_id === user.id && m.role !== "owner")
  );

  const quotaLabel =
    quotaLimit === Infinity
      ? t("planUnlimited", { plan })
      : t("planUsage", { owned, limit: quotaLimit });

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {quotaLabel}
              {quotaReached && (
                <span className="text-destructive"> — {t("quotaReached")}</span>
              )}
            </p>
            <Hint>
              {t("quotaTooltip")}
            </Hint>
          </div>
        </div>
        <CreateWorldButton disabled={quotaReached} quotaReached={quotaReached} />
      </header>

      {/* Mes mondes */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("myWorlds")}
        </h2>
        {mine.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3 rounded-2xl border border-dashed border-border">
            <Globe className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
            {!quotaReached && (
              <CreateWorldButton label="Créer mon premier monde" disabled={false} quotaReached={false} />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {mine.map((world) => (
              <Link key={world.id} href={`/w/${world.id}`}>
                <WorldCardItem world={world} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Mondes partagés */}
      {shared.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {t("sharedWithMe")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shared.map((world) => (
              <Link key={world.id} href={`/w/${world.id}`}>
                <WorldCardItem world={world} isShared />
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function WorldCardItem({
  world,
  isShared = false,
}: {
  world: WorldCard;
  isShared?: boolean;
}) {
  const hasMembers = world.world_members.some((m) => m.user_id !== world.owner_id);

  return (
    <div className="group relative overflow-hidden rounded-2xl aspect-[4/3] cursor-pointer">
      {world.banner_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={world.banner_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: world.color ?? "hsl(var(--card))" }}
        />
      )}

      <div
        className={
          world.banner_url
            ? "absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
            : "absolute inset-0 bg-gradient-to-tl from-white/5 to-transparent"
        }
      />

      {/* Icône centrée (sans bannière) */}
      {!world.banner_url && (
        <div className="absolute inset-0 flex items-center justify-center">
          {world.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={world.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover shadow" />
          ) : (isShared || hasMembers) ? (
            <Globe size={40} className="text-white" />
          ) : (
            <GlobeLock size={40} className="text-white" />
          )}
        </div>
      )}

      {/* Footer de la carte */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        {world.banner_url && world.icon_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={world.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover shadow mb-1.5" />
        )}
        <p className="text-sm font-semibold text-white leading-tight drop-shadow">
          {world.name}
        </p>
        {world.description && (
          <p className="text-xs text-white/70 truncate mt-0.5">{world.description}</p>
        )}
      </div>
    </div>
  );
}
