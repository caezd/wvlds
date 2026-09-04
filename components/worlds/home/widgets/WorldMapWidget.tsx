"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Map as MapIcon, MapPin } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";

/** Ce que le bloc sait d'une carte : de quoi la montrer et la compter. */
export type MapWidgetMap = {
  id: string;
  label: string;
  image_url: string | null;
  pin_count: number;
};

/** Largeur de la vignette — un seul palier, pour que tous partagent le cache. */
const THUMB_WIDTH = 640;

/**
 * Charge les cartes d'un monde et le nombre de lieux de chacune.
 *
 * Partagé entre le rendu serveur (`WorldHomeContent`) et le bloc lui-même, qui
 * charge seul quand il vient d'être ajouté à la grille sans rechargement de
 * page. Le compte se fait ici et non par une requête d'agrégat : PostgREST ne
 * groupe pas, et lire un identifiant par épingle reste dérisoire.
 */
export async function loadMapWidgetData(
  supabase: ReturnType<typeof createClient>,
  worldId: string,
): Promise<MapWidgetMap[]> {
  const [{ data: maps }, { data: pins }] = await Promise.all([
    supabase
      .from("world_maps")
      .select("id, label, image_url")
      .eq("world_id", worldId)
      .order("sort_index"),
    supabase.from("world_map_pins").select("map_id").eq("world_id", worldId),
  ]);
  const parCarte = new Map<string, number>();
  for (const p of (pins ?? []) as { map_id: string }[]) {
    parCarte.set(p.map_id, (parCarte.get(p.map_id) ?? 0) + 1);
  }
  return ((maps ?? []) as Omit<MapWidgetMap, "pin_count">[]).map((m) => ({
    ...m,
    pin_count: parCarte.get(m.id) ?? 0,
  }));
}

/**
 * Bloc « Carte » de l'accueil d'un monde.
 *
 * La carte était invisible tant qu'on ne cliquait pas son onglet : rien sur
 * l'accueil ne disait qu'un monde en avait une, ni combien de lieux elle
 * portait. Le bloc montre la première carte en vignette, nomme les autres, et
 * mène à chacune — l'adresse sait ouvrir une carte précise.
 */
export function WorldMapWidget({
  worldId,
  initialMaps,
}: {
  worldId: string;
  /** Données résolues côté serveur (cf. WorldHomeContent). `undefined` =
   *  non fournies, le bloc charge alors lui-même au montage. */
  initialMaps?: MapWidgetMap[];
}) {
  const t = useTranslations("map");
  const [maps, setMaps] = useState<MapWidgetMap[]>(initialMaps ?? []);
  const hasServerData = initialMaps !== undefined;

  useEffect(() => {
    if (hasServerData) return;
    let annule = false;
    void loadMapWidgetData(createClient(), worldId).then((m) => { if (!annule) setMaps(m); });
    return () => { annule = true; };
  }, [worldId, hasServerData]);

  const base = `/w/${worldId}?view=map`;
  // La première carte qui a une image ; à défaut, la première tout court.
  const vedette = maps.find((m) => m.image_url) ?? maps[0];
  const totalLieux = maps.reduce((n, m) => n + m.pin_count, 0);
  const vignette = vedette?.image_url ? supabaseThumb(vedette.image_url, THUMB_WIDTH) ?? vedette.image_url : null;

  if (!vedette) {
    return (
      <Link
        href={base}
        className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <MapIcon className="h-5 w-5 shrink-0 opacity-60" />
        {t("noMapConfigured")}
      </Link>
    );
  }

  return (
    <section aria-label={t("title")} className="overflow-hidden rounded-xl border border-border-soft bg-background">
      <Link href={`${base}&map=${vedette.id}`} className="group relative block aspect-[2/1] w-full bg-secondary">
        {vignette && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vignette}
            alt={vedette.label?.trim() || t("title")}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
          <span className="truncate text-sm font-semibold text-white">
            {vedette.label?.trim() || t("title")}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-white/80">
            <MapPin className="h-3 w-3" />
            {t("widgetPlaces", { count: totalLieux })}
          </span>
        </div>
      </Link>

      {maps.length > 1 && (
        <ul className="flex flex-wrap gap-1 px-3 py-2" aria-label={t("mapsTablist")}>
          {maps.map((m) => (
            <li key={m.id}>
              <Link
                href={`${base}&map=${m.id}`}
                className="rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {m.label?.trim() || t("title")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
