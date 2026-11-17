"use client";

import * as React from "react";

import type { SupabaseClient } from "@supabase/supabase-js";
import { topic, useTopic } from "@/lib/realtimeHub";
import type {
  MapPin,
  MapPinLink,
  MapRegion,
  WorldMapData,
} from "@/app/actions/worldMap";

/**
 * Fusionne une ligne dans une liste, plutôt que de l'y ajouter.
 *
 * Postgres nous renvoie AUSSI ce que l'on vient d'écrire soi-même, déjà posé
 * à l'écran sans attendre le serveur : ajouter en aveugle faisait apparaître
 * le lieu en double, avec deux fois la même clé React.
 */
export function mergeById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];
}

/** Ce qu'un événement Postgres apporte : la ligne d'après, ou celle d'avant. */
type Echo = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

/** Les listes que la carte tient, et ce qui en est ouvert à l'écran. */
export type MapRealtimeTargets = {
  setMaps: React.Dispatch<React.SetStateAction<WorldMapData[]>>;
  setPins: React.Dispatch<React.SetStateAction<MapPin[]>>;
  setRegions: React.Dispatch<React.SetStateAction<MapRegion[]>>;
  setLinks: React.Dispatch<React.SetStateAction<MapPinLink[]>>;
  setSelectedPin: React.Dispatch<React.SetStateAction<MapPin | null>>;
  setSelectedRegion: React.Dispatch<React.SetStateAction<MapRegion | null>>;
  setSelectedLink: React.Dispatch<React.SetStateAction<MapPinLink | null>>;
  /** Les personas se relisent en bloc : voir `getPlacedPersonas`. */
  reloadPersonas: () => void;
};

/**
 * Applique un écho à une liste — et à ce qui en est ouvert.
 *
 * Les quatre tables de la carte réagissaient de la même façon, écrite quatre
 * fois : une ligne supprimée disparaît de la liste ET du panneau qui la
 * montrait, une ligne insérée ou corrigée est fusionnée et rafraîchit ce
 * panneau. Une seule écriture, et l'oubli d'un des deux côtés cesse d'être
 * possible.
 */
function appliquer<T extends { id: string }>(
  echo: Echo,
  setListe: React.Dispatch<React.SetStateAction<T[]>>,
  setOuvert?: React.Dispatch<React.SetStateAction<T | null>>,
) {
  if (echo.eventType === "DELETE") {
    const id = (echo.old as { id: string }).id;
    setListe((prev) => prev.filter((x) => x.id !== id));
    setOuvert?.((prev) => (prev?.id === id ? null : prev));
    return;
  }
  const ligne = echo.new as T;
  setListe((prev) => mergeById(prev, ligne));
  setOuvert?.((prev) => (prev?.id === ligne.id ? ligne : prev));
}

/**
 * Tient la carte à jour de ce que les autres y font.
 *
 * Un seul canal pour les cinq tables — celui du monde, partagé : chaque abonnement de plus est une
 * connexion que le serveur maintient, et elles parlent toutes du même monde.
 *
 * Les cibles sont lues dans une ref plutôt que déclarées en dépendances : ce
 * sont des `setState`, stables par construction, mais l'objet qui les porte
 * est reconstruit à chaque rendu — le mettre en dépendance rouvrirait le
 * canal à chaque frappe au clavier.
 */
export function useMapRealtime(
  supabase: SupabaseClient,
  worldId: string,
  targets: MapRealtimeTargets,
) {
  const cibles = React.useRef(targets);
  cibles.current = targets;

  // Canal privé du monde (migration 214), partagé par lib/realtimeHub avec
  // les autres écrans du monde. Les avis `map` portent la ligne entière (les
  // quatre tables sont lisibles par tous les membres) ; `persona` ne porte
  // qu'un id : la liste des personas placés se relit en bloc.
  useTopic(topic.world(worldId), ({ event, payload }) => {
    const t = cibles.current;
    if (event === "persona") {
      t.reloadPersonas();
      return;
    }
    if (event !== "map") return;
    const avis = payload as { table?: string; op?: string; id?: string; record?: Record<string, unknown> };
    if (!avis.op) return;
    const echo: Echo = {
      eventType: avis.op,
      new: avis.record ?? {},
      old: { id: avis.id ?? (avis.record?.id as string | undefined) },
    };
    switch (avis.table) {
      case "world_map_pins":
        appliquer<MapPin>(echo, t.setPins, t.setSelectedPin);
        return;
      case "world_map_regions":
        appliquer<MapRegion>(echo, t.setRegions, t.setSelectedRegion);
        return;
      case "world_map_pin_links":
        appliquer<MapPinLink>(echo, t.setLinks, t.setSelectedLink);
        return;
      case "world_maps": {
        // Une carte supprimée emporte ce qui vivait dessus. Rien ne s'en
        // voit — l'écran ne montre que la carte ouverte, et celle-ci
        // n'existe plus —, mais garder en mémoire des lignes que la base
        // a effacées finit toujours par se payer. Les liens manquaient à
        // l'appel : les trois y sont.
        if (echo.eventType === "DELETE") {
          const id = (echo.old as { id: string }).id;
          t.setMaps((prev) => prev.filter((m) => m.id !== id));
          t.setPins((prev) => prev.filter((p) => p.map_id !== id));
          t.setRegions((prev) => prev.filter((r) => r.map_id !== id));
          t.setLinks((prev) => prev.filter((l) => l.map_id !== id));
          return;
        }
        t.setMaps((prev) => mergeById(prev, echo.new as WorldMapData));
        return;
      }
    }
  }, { client: supabase });
}
