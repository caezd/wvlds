"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { resolveWikiLinks, type WikiLinkTarget } from "@/lib/wikiLinks";
import { mapLinkHref, useMapLinkTargets } from "@/hooks/useMapLinkTargets";

/**
 * Ce qu'il faut pour qu'un `[[lien]]` vive hors du wiki.
 *
 * Dans un salon, un message qui disait « vous entrez dans [[Arkham]] »
 * affichait un lien rouge barré, comme une erreur : le rendu sait résoudre
 * ces liens, mais personne ne lui donnait les pages du monde ni où aller.
 * C'est là qu'un monde se joue, pourtant — le wiki cesse d'être une annexe
 * qu'on consulte pour devenir quelque chose qu'on cite.
 */
type WikiLinks = {
  /** Réécrit les `[[Titre]]` d'un markdown en liens que le rendu sait ouvrir. */
  resolve: (markdown: string) => string;
  /** Ouvre la page visée, dans le wiki du monde. */
  onWikiLink: (slug: string, anchor?: string) => void;
  /** Ouvre la carte sur le lieu visé — `[[lieu:…]]`. */
  onMapLink: (pinId: string) => void;
};

const WikiLinkContext = React.createContext<WikiLinks | null>(null);

/**
 * Fournit la résolution des liens pour tout ce qui se rend en dessous.
 *
 * Les pages sont lues une fois par monde — titre et slug seulement, jamais le
 * contenu — et gardées le temps de la visite. Une page créée pendant qu'on
 * lit un salon n'y sera connue qu'à la prochaine ouverture : c'est un prix
 * léger pour ne pas ouvrir un canal de plus par salon.
 */
export function WikiLinkProvider({
  worldId,
  children,
}: {
  worldId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [targets, setTargets] = React.useState<WikiLinkTarget[]>([]);

  React.useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("world_wiki_pages")
        .select("title, slug, is_folder")
        .eq("world_id", worldId)
        .is("deleted_at", null);
      if (!cancelled) setTargets((data ?? []) as WikiLinkTarget[]);
    })();
    return () => { cancelled = true; };
  }, [worldId]);
  // Après les pages : la file de résultats du simulacre de tests suit l'ordre
  // des requêtes, et c'est l'ordre qu'on lit ici.
  const pins = useMapLinkTargets(worldId);

  const value = React.useMemo<WikiLinks>(
    () => ({
      resolve: markdown => resolveWikiLinks(markdown, targets, pins),
      onWikiLink: (slug, anchor) => {
        const page = slug ? `&page=${encodeURIComponent(slug)}` : "";
        const hash = anchor ? `#${anchor}` : "";
        router.push(`/w/${worldId}?view=wiki${page}${hash}`);
      },
      onMapLink: pinId => {
        const lieu = pins.find(p => p.id === pinId);
        if (lieu) router.push(mapLinkHref(worldId, lieu));
      },
    }),
    [targets, pins, router, worldId],
  );

  return <WikiLinkContext.Provider value={value}>{children}</WikiLinkContext.Provider>;
}

/**
 * Les liens du wiki, ou rien.
 *
 * `null` hors de tout fournisseur : le rendu garde alors son comportement
 * d'origine — le lien reste visiblement cassé plutôt que de mener nulle part.
 */
export function useWikiLinks(): WikiLinks | null {
  return React.useContext(WikiLinkContext);
}
