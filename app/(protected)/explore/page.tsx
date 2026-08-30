import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getCachedFeatureFlags } from "@/lib/currentRequest";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Compass, Globe } from "lucide-react";
import { ExploreSearch } from "./ExploreSearch";
import { ExploreFilters } from "./ExploreFilters";
import { JoinWorldButton } from "./JoinWorldButton";
import { ExploreWorldCard, type PublicWorld } from "./ExploreWorldCard";
import { getTranslations } from "next-intl/server";
import { buildExploreParams, MAX_FILTER_TAGS } from "./exploreQuery";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

const PAGE_SIZE = 16;
const NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000";
const MAX_TAG_LENGTH = 24;

type LatestWorld = {
  id: string;
  name: string;
  icon_url: string | null;
  color: string | null;
  is_age_restricted: boolean | null;
};

/** Titre d'onglet — sans lui la page héritait du « WVLDS » générique. */
export async function generateMetadata() {
  const t = await getTranslations("explore");
  return { title: t("title") };
}

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

  // Une seule vague pour tout ce qui ne dépend pas de la requête `worlds` :
  // les adhésions (pour exclure les mondes déjà rejoints), les mondes portant
  // les tags filtrés, la liste des tags publics et les traductions. Ces quatre
  // appels étaient enchaînés alors qu'aucun n'attend le résultat d'un autre.
  const [membershipsRes, tagWorldRes, tagOptionsRes, t] = await Promise.all([
    userId
      ? supabase.from("world_members").select("world_id").eq("user_id", userId)
      : Promise.resolve({ data: [] as { world_id: string }[] }),
    selectedTags.length > 0
      ? supabase.rpc("get_world_ids_for_tags", { tags: selectedTags })
      : Promise.resolve({ data: null }),
    supabase.rpc("get_public_world_tags"),
    getTranslations("explore"),
  ]);

  // L'Explorateur est un annuaire : les mondes déjà rejoints n'y apparaissent
  // plus (ils restent accessibles depuis "Mes mondes").
  const joinedWorldIds = ((membershipsRes.data ?? []) as { world_id: string }[])
    .map((m) => m.world_id);

  let query = supabase
    .from("worlds")
    .select(
      "id, name, description, banner_url, icon_url, color, allows_real_avatars, allows_illustrated_avatars, is_age_restricted",
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
    const matchingIds = ((tagWorldRes.data ?? []) as { world_id: string }[]).map((r) => r.world_id);
    query = query.in("id", matchingIds.length > 0 ? matchingIds : [NO_MATCH_SENTINEL]);
  }

  // Vitrine "derniers mondes créés" : fixe, indépendante des filtres/recherche
  // en cours, pour toujours pouvoir repérer les nouveautés de l'annuaire.
  let latestQuery = supabase
    .from("worlds")
    .select("id, name, icon_url, color, is_age_restricted")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .eq("is_archived", false);
  if (joinedWorldIds.length > 0) {
    latestQuery = latestQuery.not("id", "in", `(${joinedWorldIds.join(",")})`);
  }

  const [{ data: worlds, count }, { data: latest }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    latestQuery.order("created_at", { ascending: false }).limit(3),
  ]);
  const tagOptions = tagOptionsRes.data;

  const publicWorlds = (worlds ?? []) as PublicWorld[];
  const availableTags = ((tagOptions ?? []) as { tag: string; world_count: number }[]).map((t) => t.tag);
  const latestWorlds = (latest ?? []) as LatestWorld[];

  // Tags affichés sur chaque carte (aperçu au survol) — jusqu'à 5 par monde.
  const cardTagsByWorld = new Map<string, string[]>();
  if (publicWorlds.length > 0) {
    const { data: cardTagRows } = await supabase
      .from("world_tags")
      .select("world_id, tag")
      .in("world_id", publicWorlds.map((w) => w.id))
      .order("created_at", { ascending: true });
    for (const row of cardTagRows ?? []) {
      const list = cardTagsByWorld.get(row.world_id) ?? [];
      if (list.length < 5) list.push(row.tag);
      cardTagsByWorld.set(row.world_id, list);
    }
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!q || selectedTags.length > 0 || selectedAvatarTypes.length > 0;


  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorldPanelHeader
        icon={<Compass className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={<ExploreSearch defaultValue={q} tags={selectedTags} avatarTypes={selectedAvatarTypes} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <p className="text-xs text-muted-foreground">
            {t("worldsCount", { count: total })}
            {q && <span className="ml-1">· « {q} »</span>}
          </p>

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
                      tags={cardTagsByWorld.get(world.id) ?? []}
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
      <JoinWorldButton worldId={world.id} worldName={world.name} ageRestricted={!!world.is_age_restricted} compact />
    </div>
  );
}
