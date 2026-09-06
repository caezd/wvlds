import type { MapPin } from "@/app/actions/worldMap";
import type { MapRegion, PlacedPersona, WorldMapData } from "@/app/actions/worldMap";

/** Épingle de test — les champs qui comptent se passent en surcharge. */
export function makePin(overrides: Partial<MapPin> = {}): MapPin {
  return {
    id: "pin1",
    world_id: "w1",
    map_id: "map1",
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
    target_map_id: null,
    exists_from: null,
    exists_until: null,
    ...overrides,
  };
}

export function makeMap(overrides: Partial<WorldMapData> = {}): WorldMapData {
  return {
    id: "map1",
    world_id: "w1",
    image_url: "https://x.supabase.co/storage/v1/object/public/worlds/w1/map.webp",
    label: "Carte",
    sort_index: 0,
    scale_width_units: null,
    scale_unit: null,
    ...overrides,
  };
}

export const WIKI_PAGES = [
  { id: "p1", title: "Arkham", slug: "arkham" },
  { id: "p2", title: "Innsmouth", slug: "innsmouth" },
];


/** Une région — un carré au milieu de la carte, voir migration 157. */
export function makeRegion(overrides: Partial<MapRegion> = {}): MapRegion {
  return {
    id: "reg1",
    world_id: "w1",
    map_id: "map1",
    label: "Le royaume",
    description: null,
    color: "#22c55e",
    points: [{ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }],
    wiki_page_id: null,
    sort_index: 0,
    ...overrides,
  };
}

/** Un persona posé sur un lieu — voir migration 154. */
export function makePlacedPersona(overrides: Partial<PlacedPersona> = {}): PlacedPersona {
  return { id: "per1", name: "Kael", avatar_url: null, map_pin_id: "pin1", ...overrides };
}
