import { TABLE } from "@/lib/constants";

/**
 * Les salles de la chatbox d'un monde (migration 238).
 *
 * Trois sortes d'endroits où un message peut vivre :
 * - la salle principale, toujours là : ni salle ni salon (`channel_id` et
 *   `chatroom_id` nuls) — les messages d'avant les salles y sont restés ;
 * - une salle personnalisée (`world_live_channels`) : nom, couleur, icône ;
 * - le fil d'un salon de jeu (`chatroom_id`), ouvert de lui-même quand on est
 *   dans ce salon.
 */

export type LiveChannel = {
  id: string;
  world_id: string;
  name: string;
  /** `#rrggbb`, ou nul : la couleur du texte. */
  color: string | null;
  /** Icône Lucide (kebab-case), ou nulle : « # ». */
  icon: string | null;
  sort_index: number;
  /**
   * Le groupe de personas qui y a accès (migration 243), sous-groupes compris ;
   * nul : tous les membres. La RLS cache la salle aux autres.
   */
  group_id: string | null;
};

export const LIVE_CHANNEL_COLUMNS = "id, world_id, name, color, icon, sort_index, group_id";
export const LIVE_CHANNEL_NAME_MAX = 40;

export type LiveChatPlace =
  | { kind: "main" }
  | { kind: "channel"; id: string }
  | { kind: "chatroom"; id: string };

export const MAIN_PLACE: LiveChatPlace = { kind: "main" };

/** Une clé stable pour un endroit : « main », « c:<id> », « r:<id> ». */
export function placeKey(place: LiveChatPlace): string {
  return place.kind === "main" ? "main" : place.kind === "channel" ? `c:${place.id}` : `r:${place.id}`;
}

/** L'endroit d'un message, d'après ses colonnes. */
export function placeOf(row: { channel_id?: string | null; chatroom_id?: string | null }): LiveChatPlace {
  if (row.chatroom_id) return { kind: "chatroom", id: row.chatroom_id };
  if (row.channel_id) return { kind: "channel", id: row.channel_id };
  return MAIN_PLACE;
}

/** Les colonnes d'un message posé à cet endroit. */
export function placeColumns(place: LiveChatPlace): { channel_id: string | null; chatroom_id: string | null } {
  return {
    channel_id: place.kind === "channel" ? place.id : null,
    chatroom_id: place.kind === "chatroom" ? place.id : null,
  };
}

/** Trie les salles comme dans les réglages : rang, puis nom. */
export function sortChannels(list: LiveChannel[]): LiveChannel[] {
  return [...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name));
}

type Client = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        order: (col: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

export async function fetchLiveChannels(supabase: Client, worldId: string): Promise<LiveChannel[]> {
  const { data, error } = await supabase
    .from(TABLE.WORLD_LIVE_CHANNELS)
    .select(LIVE_CHANNEL_COLUMNS)
    .eq("world_id", worldId)
    .order("sort_index");
  if (error) {
    console.error("[worldLiveChannels] lecture", error.message);
    return [];
  }
  return sortChannels((data ?? []) as LiveChannel[]);
}
