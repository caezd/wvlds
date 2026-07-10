import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getCachedFeatureFlags } from "@/lib/currentRequest";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Globe, Camera, Palette } from "lucide-react";
import { ExploreSearch } from "./ExploreSearch";
import { ExploreFilters } from "./ExploreFilters";
import { JoinWorldButton } from "./JoinWorldButton";
import { getTranslations } from "next-intl/server";
import { buildExploreParams } from "./exploreQuery";

const PAGE_SIZE = 16;
const NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000";
const MAX_FILTER_TAGS = 10;
const MAX_TAG_LENGTH = 24;

type PublicWorld = {
  id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  color: string | null;
  allows_real_avatars: boolean | null;
  allows_illustrated_avatars: boolean | null;
};

type LatestWorld = {
  id: string;
  name: string;
  icon_url: string | null;
  color: string | null;
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string; tags?: string; avatar?: string }>;
}) {
  const supabase = await createClient();
  const [flags, userId] = await Promise.all([
    getCachedFeatureFlags(),
    getCurrentUserId(),
  ]);

  if (!flags.public_worlds) notFound();

  const resolved = await searchParams;
  const q = resolved?.q?.trim() ?? "";
  const page = Math.max(0, parseInt(resolved?.page ?? "0", 10));
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Dérivé directement de l'URL : on déduplique et on borne (nombre + longueur)
  // pour éviter des requêtes `.in(...)` coûteuses sur une liste forgée.
  const selectedTags = Array.from(
    new Set(
      (resolved?.tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= MAX_TAG_LENGTH),
    ),
  ).slice(0, MAX_FILTER_TAGS);
  const selectedAvatarTypes = (resolved?.avatar ?? "")
    .split(",")
    .filter((v): v is "real" | "illustrated" => v === "real" || v === "illustrated");

  // L'Explorateur est un annuaire : les mondes déjà rejoints n'y apparaissent
  // plus (ils restent accessibles depuis "Mes mondes").
  let joinedWorldIds: string[] = [];
  if (userId) {
    const { data: memberships } = await supabase
      .from("world_members")
      .select("world_id")
      .eq("user_id", userId);
    joinedWorldIds = (memberships ?? []).map((m) => m.world_id as string);
  }

  let query = supabase
    .from("worlds")
    .select(
      "id, name, description, banner_url, icon_url, color, allows_real_avatars, allows_illustrated_avatars",
      { count: "exact" },
    )
    .eq("visibility", "public")
    .is("deleted_at", null)
    .eq("is_archived", false);

  if (joinedWorldIds.length > 0) {
    query = query.not("id", "in", `(${joinedWorldIds.join(",")})`);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  if (selectedAvatarTypes.length === 1) {
    query = query.eq(
      selectedAvatarTypes[0] === "real" ? "allows_real_avatars" : "allows_illustrated_avatars",
      true,
    );
  } else if (selectedAvatarTypes.length === 2) {
    query = query.or("allows_real_avatars.eq.true,allows_illustrated_avatars.eq.true");
  }

  if (selectedTags.length > 0) {
    const { data: tagRows } = await supabase
      .from("world_tags")
      .select("world_id")
      .in("tag", selectedTags);
    const matchingIds = Array.from(new Set((tagRows ?? []).map((r) => r.world_id as string)));
    query = query.in("id", matchingIds.length > 0 ? matchingIds : [NO_MATCH_SENTINEL]);
  }

  // Vitrine "derniers mondes créés" : fixe, indépendante des filtres/recherche
  // en cours, pour toujours pouvoir repérer les nouveautés de l'annuaire.
  let latestQuery = supabase
    .from("worlds")
    .select("id, name, icon_url, color")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .eq("is_archived", false);
  if (joinedWorldIds.length > 0) {
    latestQuery = latestQuery.not("id", "in", `(${joinedWorldIds.join(",")})`);
  }

  const [{ data: worlds, count }, { data: tagOptions }, { data: latest }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    supabase.rpc("get_public_world_tags"),
    latestQuery.order("created_at", { ascending: false }).limit(3),
  ]);

  const publicWorlds = (worlds ?? []) as PublicWorld[];
  const availableTags = ((tagOptions ?? []) as { tag: string; world_count: number }[]).map((t) => t.tag);
  const latestWorlds = (latest ?? []) as LatestWorld[];

  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!q || selectedTags.length > 0 || selectedAvatarTypes.length > 0;
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
        <ExploreSearch defaultValue={q} tags={selectedTags} avatarTypes={selectedAvatarTypes} />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Contenu principal (3/4) */}
        <div className="space-y-6 lg:col-span-3">
          <ExploreFilters
            q={q}
            availableTags={availableTags}
            selectedTags={selectedTags}
            selectedAvatarTypes={selectedAvatarTypes}
          />

          {publicWorlds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3 rounded-2xl border border-dashed border-border">
              <Globe className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t("noResults") : t("noWorlds")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {publicWorlds.map((world) => (
                <ExploreWorldCard
                  key={world.id}
                  world={world}
                  noDescription={t("noDescription")}
                  avatarRealLabel={t("avatarReal")}
                  avatarIllustratedLabel={t("avatarIllustrated")}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {page > 0 && (
                <Link
                  href={`/explore?${buildExploreParams({ q, tags: selectedTags, avatarTypes: selectedAvatarTypes, page: page - 1 })}`}
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
                  href={`/explore?${buildExploreParams({ q, tags: selectedTags, avatarTypes: selectedAvatarTypes, page: page + 1 })}`}
                  className="rounded-xl border border-border px-4 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  {t("next")}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Derniers mondes créés (1/4) */}
        <aside className="space-y-3 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("latestWorlds")}
          </p>
          {latestWorlds.length === 0 ? (
            <p className="text-xs italic text-muted-foreground/60">{t("noWorlds")}</p>
          ) : (
            <div className="space-y-2">
              {latestWorlds.map((world) => (
                <LatestWorldRow key={world.id} world={world} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ExploreWorldCard({
  world,
  noDescription,
  avatarRealLabel,
  avatarIllustratedLabel,
}: {
  world: PublicWorld;
  noDescription: string;
  avatarRealLabel: string;
  avatarIllustratedLabel: string;
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Hero */}
      <div className="relative overflow-hidden aspect-[4/3]">
        {world.banner_url ? (
          <Image
            src={world.banner_url}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
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
              <Image src={world.icon_url} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover shadow" />
            ) : (
              <Globe size={40} className="text-white/60" />
            )}
          </div>
        )}
        {/* Nom + icône dans le footer du hero */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {world.banner_url && world.icon_url && (
            <Image src={world.icon_url} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover shadow mb-1.5" />
          )}
          <p className="text-sm font-semibold text-white leading-tight drop-shadow">
            {world.name}
          </p>
        </div>
        {/* Type d'avatars, uniquement si le monde en a explicitement déclaré au moins un */}
        {(world.allows_real_avatars || world.allows_illustrated_avatars) && (
          <div className="absolute top-2 right-2 flex gap-1">
            {world.allows_real_avatars && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm" title={avatarRealLabel}>
                <Camera className="h-3 w-3" />
              </span>
            )}
            {world.allows_illustrated_avatars && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm" title={avatarIllustratedLabel}>
                <Palette className="h-3 w-3" />
              </span>
            )}
          </div>
        )}
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

        <JoinWorldButton worldId={world.id} />
      </div>
    </div>
  );
}

function LatestWorldRow({ world }: { world: LatestWorld }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ backgroundColor: !world.icon_url ? (world.color ?? "#64748b") : undefined }}
      >
        {world.icon_url ? (
          <Image src={world.icon_url} alt="" width={36} height={36} className="h-full w-full object-cover" />
        ) : (
          <Globe className="h-4 w-4 text-white/90" />
        )}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{world.name}</p>
      <JoinWorldButton worldId={world.id} compact />
    </div>
  );
}
