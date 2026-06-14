import type { SupabaseClient } from "@supabase/supabase-js";

export const FLAG_KEYS = [
  "avatar_builder",
  "persona_fields",
  "persona_field_title",
  "persona_field_text",
  "persona_field_stats",
  "persona_field_separator",
  "persona_field_image_grid",
  "shop",
  "public_worlds",
  "emoji_reactions",
  "chatroom_media",
  "create_chatroom",
  "post_message",
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
  shop: true,
  public_worlds: false,
  emoji_reactions: true,
  chatroom_media: true,
  create_chatroom: true,
  post_message: true,
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
