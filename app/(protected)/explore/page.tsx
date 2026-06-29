import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/featureFlags";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Globe } from "lucide-react";
import { ExploreSearch } from "./ExploreSearch";
import { JoinWorldButton } from "./JoinWorldButton";
import { getTranslations } from "next-intl/server";

const PAGE_SIZE = 16;

type PublicWorld = {
  id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  color: string | null;
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const [flags, userId] = await Promise.all([
    getFeatureFlags(supabase),
    getUserId(supabase),
  ]);

  if (!flags.public_worlds) notFound();

  const resolved = await searchParams;
  const q = resolved?.q?.trim() ?? "";
  const page = Math.max(0, parseInt(resolved?.page ?? "0", 10));
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("worlds")
    .select("id, name, description, banner_url, icon_url, color", { count: "exact" })
    .eq("visibility", "public")
    .is("deleted_at", null)
    .eq("is_archived", false);

  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data: worlds, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const publicWorlds = (worlds ?? []) as PublicWorld[];

  // Déterminer quels mondes l'utilisateur a déjà rejoints
  let memberSet = new Set<string>();
  if (userId && publicWorlds.length > 0) {
    const worldIds = publicWorlds.map((w) => w.id);
    const { data: memberships } = await supabase
      .from("world_members")
      .select("world_id")
      .in("world_id", worldIds)
      .eq("user_id", userId);
    memberSet = new Set((memberships ?? []).map((m) => m.world_id));
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const t = await getTranslations("explore");

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("worldsCount", { count: total })}
            {q && <span className="ml-1">· « {q} »</span>}
          </p>
        </div>
        <ExploreSearch defaultValue={q} />
      </header>

      {publicWorlds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 rounded-2xl border border-dashed border-border">
          <Globe className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {q ? t("noResults") : t("noWorlds")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {publicWorlds.map((world) => {
            const isMember = memberSet.has(world.id);
            return (
              <ExploreWorldCard
                key={world.id}
                world={world}
                isMember={isMember}
                noDescription={t("noDescription")}
              />
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {page > 0 && (
            <Link
              href={`/explore?q=${encodeURIComponent(q)}&page=${page - 1}`}
              className="rounded-xl border border-border px-4 py-1.5 text-sm hover:bg-muted/50 transition-colors"
            >
              {t("previous")}
            </Link>
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {page + 1} / {totalPages}
          </span>
          {page < totalPages - 1 && (
            <Link
              href={`/explore?q=${encodeURIComponent(q)}&page=${page + 1}`}
              className="rounded-xl border border-border px-4 py-1.5 text-sm hover:bg-muted/50 transition-colors"
            >
              {t("next")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ExploreWorldCard({
  world,
  isMember,
  noDescription,
}: {
  world: PublicWorld;
  isMember: boolean;
  noDescription: string;
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Hero */}
      <div className="relative overflow-hidden aspect-[4/3]">
        {world.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={world.banner_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
              ? "absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
              : "absolute inset-0 bg-gradient-to-tl from-white/5 to-transparent"
          }
        />
        {/* Icône centrée (sans bannière) */}
        {!world.banner_url && (
          <div className="absolute inset-0 flex items-center justify-center">
            {world.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={world.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover shadow" />
            ) : (
              <Globe size={40} className="text-white/60" />
            )}
          </div>
        )}
        {/* Nom + icône dans le footer du hero */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {world.banner_url && world.icon_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={world.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover shadow mb-1.5" />
          )}
          <p className="text-sm font-semibold text-white leading-tight drop-shadow">
            {world.name}
          </p>
        </div>
      </div>

      {/* Description + CTA */}
      <div className="flex flex-col gap-3 p-3">
        {world.description ? (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {world.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic">{noDescription}</p>
        )}

        {isMember ? (
          <Link
            href={`/w/${world.id}`}
            className="w-full rounded-xl border border-border py-1.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
          >
            Entrer
          </Link>
        ) : (
          <JoinWorldButton worldId={world.id} />
        )}
      </div>
    </div>
  );
}
