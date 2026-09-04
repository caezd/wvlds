"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

type EpingleLiee = { id: string; map_id: string; title: string };

/**
 * « Où est ce lieu sur la carte ? »
 *
 * Une épingle peut désigner la page qu'elle raconte depuis la migration 150,
 * et l'index `wmp_wiki_page_idx` a été posé ce jour-là pour lire ce lien à
 * l'envers — sans que rien ne l'ait jamais fait. C'est chose faite : la page
 * d'un lieu mène à sa position, et l'adresse de la carte sait désormais
 * désigner une épingle précise.
 *
 * Rien ne s'affiche quand aucune épingle ne pointe la page : le silence est le
 * cas courant, une page de wiki sur trois n'est pas un lieu.
 */
export function WikiPageMapLink({ worldId, pageId }: { worldId: string; pageId: string }) {
  const t = useTranslations("map");
  const router = useRouter();
  const { world_map } = useFeatureFlags();
  const [epingles, setEpingles] = React.useState<EpingleLiee[]>([]);

  React.useEffect(() => {
    if (!world_map) return;
    let annule = false;
    const supabase = createClient();
    void supabase
      .from("world_map_pins")
      .select("id, map_id, title")
      .eq("world_id", worldId)
      .eq("wiki_page_id", pageId)
      .then(({ data }: { data: EpingleLiee[] | null }) => {
        if (!annule) setEpingles(data ?? []);
      });
    return () => { annule = true; };
  }, [worldId, pageId, world_map]);

  if (epingles.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {epingles.map((epingle) => (
        <button
          key={epingle.id}
          type="button"
          onClick={() =>
            router.push(`/w/${worldId}?view=map&map=${epingle.map_id}&pin=${epingle.id}`)
          }
          className="flex items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <MapPin className="h-3.5 w-3.5" />
          {t("seeOnMap")} : {epingle.title}
        </button>
      ))}
    </div>
  );
}
