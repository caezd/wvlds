// Cache en mémoire des clés de chiffrement de salons (chatroom_keys), pour
// le centre de recherche : contrairement à la vue d'une chatroom (qui ne
// connaît que sa propre clé), une recherche peut porter sur plusieurs salons
// d'un monde et a besoin de récupérer/mémoriser plusieurs clés à la fois.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE } from "@/lib/constants";

const keyCache = new Map<string, string>();

export async function getChatroomKeys(
  supabase: SupabaseClient,
  chatIds: string[],
): Promise<Map<string, string>> {
  const missing = chatIds.filter((id) => !keyCache.has(id));
  if (missing.length > 0) {
    const { data } = await supabase
      .from(TABLE.CHATROOM_KEYS)
      .select("chatroom_id, key_b64")
      .in("chatroom_id", missing);
    for (const row of data ?? []) {
      keyCache.set(row.chatroom_id as string, row.key_b64 as string);
    }
  }
  const result = new Map<string, string>();
  for (const id of chatIds) {
    const key = keyCache.get(id);
    if (key) result.set(id, key);
  }
  return result;
}
