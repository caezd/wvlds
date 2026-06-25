import type { SupabaseClient } from "@supabase/supabase-js";

export const FLAG_KEYS = [
  "avatar_builder",
  "persona_fields",
  "persona_field_title",
  "persona_field_text",
  "persona_field_stats",
  "persona_field_separator",
  "persona_field_image_grid",
  "persona_field_inventory",
  "persona_field_skills",
  "persona_field_gauges",
  "persona_field_quote",
  "persona_field_traits",
  "persona_field_timeline",
  "shop",
  "public_worlds",
  "world_map",
  "world_catalogue",
  "emoji_reactions",
  "chatroom_media",
  "create_chatroom",
  "post_message",
  "chatroom_blocks",
  "block_npc",
  "block_hp",
  "notifications",
  "world_timeline",
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export type FeatureFlags = Record<FlagKey, boolean>;

export const DEFAULT_FLAGS: FeatureFlags = {
  avatar_builder: true,
  persona_fields: true,
  persona_field_title: true,
  persona_field_text: true,
  persona_field_stats: true,
  persona_field_separator: true,
  persona_field_image_grid: true,
  persona_field_inventory: true,
  persona_field_skills: true,
  persona_field_gauges: true,
  persona_field_quote: true,
  persona_field_traits: true,
  persona_field_timeline: true,
  shop: true,
  public_worlds: false,
  world_map: true,
  world_catalogue: true,
  emoji_reactions: true,
  chatroom_media: true,
  create_chatroom: true,
  post_message: true,
  chatroom_blocks: true,
  block_npc: true,
  block_hp: true,
  notifications: true,
  world_timeline: false,
};

export async function getFeatureFlags(supabase: SupabaseClient): Promise<FeatureFlags> {
  const { data } = await supabase
    .from("feature_flags")
    .select("key, enabled")
    .in("key", [...FLAG_KEYS]);

  const result: FeatureFlags = { ...DEFAULT_FLAGS };
  for (const row of data ?? []) {
    if (row.key in result) {
      (result as Record<string, boolean>)[row.key] = row.enabled;
    }
  }
  return result;
}
