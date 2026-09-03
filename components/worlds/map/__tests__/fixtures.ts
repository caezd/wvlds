import type { MapPin } from "@/app/actions/worldMap";
import type { WorldMapData } from "@/app/actions/worldMap";

/** Épingle de test — les champs qui comptent se passent en surcharge. */
export function makePin(overrides: Partial<MapPin> = {}): MapPin {
  return {
    id: "pin1",
    world_id: "w1",
    x: 50,
    y: 50,
    title: "Le port",
    description: null,
    banner_url: null,
    color: "#6366f1",
    icon: "map-pin",
    icon_color: "#ffffff",
    border_color: null,
    border_style: "none",
    sort_index: 0,
    wiki_page_id: null,
    ...overrides,
  };
}

export function makeMap(overrides: Partial<WorldMapData> = {}): WorldMapData {
  return {
    id: "map1",
    world_id: "w1",
    image_url: "https://x.supabase.co/storage/v1/object/public/worlds/w1/map.webp",
    label: "Carte",
    ...overrides,
  };
}

export const WIKI_PAGES = [
  { id: "p1", title: "Arkham", slug: "arkham" },
  { id: "p2", title: "Innsmouth", slug: "innsmouth" },
];
