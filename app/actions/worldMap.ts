"use server";

import { createClient } from "@/lib/supabase/server";

export type WorldMapData = {
  id: string;
  world_id: string;
  image_url: string | null;
  label: string;
};

export type MapPin = {
  id: string;
  world_id: string;
  x: number;
  y: number;
  title: string;
  description: string | null;
  banner_url: string | null;
  color: string;
  icon: string;
  icon_color: string;
  border_color: string | null;
  border_style: string;
  sort_index: number;
};

export async function getWorldMap(
  worldId: string,
): Promise<{ map: WorldMapData | null; pins: MapPin[] }> {
  const supabase = await createClient();
  const [{ data: map }, { data: pins }] = await Promise.all([
    supabase.from("world_maps").select("*").eq("world_id", worldId).maybeSingle(),
    supabase
      .from("world_map_pins")
      .select("*")
      .eq("world_id", worldId)
      .order("sort_index"),
  ]);
  return { map: map ?? null, pins: (pins as MapPin[]) ?? [] };
}

export async function upsertWorldMap(
  worldId: string,
  patch: Partial<Pick<WorldMapData, "image_url" | "label">>,
): Promise<WorldMapData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");

  const { data, error } = await supabase
    .from("world_maps")
    .upsert(
      { world_id: worldId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "world_id" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WorldMapData;
}

export async function createMapPin(
  worldId: string,
  x: number,
  y: number,
  title: string,
): Promise<MapPin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");

  const { data, error } = await supabase
    .from("world_map_pins")
    .insert({ world_id: worldId, x, y, title })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as MapPin;
}

export async function updateMapPin(
  pinId: string,
  patch: Partial<Pick<MapPin, "x" | "y" | "title" | "description" | "banner_url" | "color" | "icon" | "icon_color" | "border_color" | "border_style">>,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");

  const { error } = await supabase
    .from("world_map_pins")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", pinId);

  if (error) throw new Error(error.message);
}

export async function deleteMapPin(pinId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");

  const { error } = await supabase
    .from("world_map_pins")
    .delete()
    .eq("id", pinId);

  if (error) throw new Error(error.message);
}
