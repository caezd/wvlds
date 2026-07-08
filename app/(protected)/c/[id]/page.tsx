import ChatRoomView from "./view";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { notFound } from "next/navigation";
import { TABLE, CHAT_MESSAGES_PAGE_SIZE } from "@/lib/constants";
import { decryptMessage } from "@/lib/crypto";
import { aggregateChoiceVotes } from "@/lib/choiceVotes";
import type { ChatMessageWithPersona, Persona, ChoiceVoteSummary } from "@/types/db";
import WorldSidebar from "@/components/worlds/WorldSidebar";
import { getTranslations } from "next-intl/server";
import { canMemberPost } from "@/lib/worldPermissions";

export default async function Page({ params }: { params: { id: string } }) {
  const t = await getTranslations("chatrooms");
  const { id } = await params;
  const supabase = await createClient();

  const userId = await getUserId(supabase);

  if (!userId) {
    notFound();
  }

  // Phase 1 — requêtes ne dépendant que de `id`/`userId`, indépendantes entre
  // elles → chargées en parallèle (chatroom, messages, clé de chiffrement,
  // persona préférée de l'utilisateur).
  const [
    { data: chatroom, error: chatErr },
    { data: messages },
    { data: keyRow },
    { data: pref },
  ] = await Promise.all([
    supabase
      .from("chatrooms")
      .select(
        "id, name, title, banner_url, icon_url, world_id, created_by, timeline_date, map_pin_id, category_id, worlds(id, name, owner_id, restrict_inventory, restrict_skills, timeline_enabled, timeline_config, world_members(user_id))",
      )
      .eq("id", id)
      .single(),
    // Derniers messages (ordre décroissant ; on remet en croissant ensuite) ;
    // le reste est chargé à la demande côté client quand on remonte l'historique
    supabase
      .from("chat_messages")
      .select(
        "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url, frame:avatar_frame_id(asset_url)), author:profiles(avatar_url, username)",
      )
      .eq("chat_id", id)
      .order("created_at", { ascending: false })
      .limit(CHAT_MESSAGES_PAGE_SIZE),
    // Clé de chiffrement (null = chatroom sans clé, messages en clair)
    supabase
      .from(TABLE.CHATROOM_KEYS)
      .select("key_b64")
      .eq("chatroom_id", id)
      .maybeSingle(),
    // Persona par défaut pour cet utilisateur dans cette chatroom (facultatif)
    supabase
      .from("chatroom_persona_prefs")
      .select("persona:personas(id, user_id, name, avatar_url, dialogue_color)")
      .eq("chat_id", id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (chatErr || !chatroom) return notFound();

  const initialMessages = (messages ?? []).slice().reverse(); // on remet en croissant
  const initialHasMore = (messages ?? []).length === CHAT_MESSAGES_PAGE_SIZE;
  const chatroomKey = (keyRow as unknown as { key_b64?: string } | null)?.key_b64 ?? null;
  const initialPersona = (pref?.persona as unknown as Persona | null) ?? null;

  /* reactions */
  type ReactionSummary = { emoji: string; count: number; me: boolean };

  const messageIds = initialMessages.map((m) => m.id);

  // Données du monde associé (extracted pour usage multiple)
  const rawWorld = chatroom.worlds as unknown;
  const worldData = (Array.isArray(rawWorld) ? rawWorld[0] : rawWorld) as { id: string; name: string; owner_id?: string; restrict_inventory?: boolean | null; restrict_skills?: boolean | null; timeline_enabled?: boolean | null; timeline_config?: unknown; world_members?: { user_id: string }[] } | null | undefined;

  // Est-on déjà certain d'être owner du monde ? Si oui, inutile d'interroger
  // `world_members` pour connaître son rôle.
  const isWorldOwner = !!worldData?.owner_id && userId === worldData.owner_id;
  const needMembership = !!chatroom.world_id && !isWorldOwner;

  // Phase 2 — requêtes dépendant de la phase 1 (messageIds, world_id) mais
  // indépendantes entre elles → en parallèle : réactions, nav des salons du
  // monde, et rôle de l'utilisateur dans le monde (si nécessaire).
  type ReactionRow = { message_id: number; emoji: string; user_id: string };
  type VoteRow = { message_id: number; option_id: string; user_id: string };
  type NavRoom = { id: string; title: string | null; name: string | null; icon_url: string | null; last_message_at: string | null; unread_count: number };

  const [reactionRows, voteRows, navResult, membership, followRow] = await Promise.all([
    (async (): Promise<ReactionRow[]> => {
      if (!messageIds.length) return [];
      const { data: rows } = await supabase
        .from("chat_message_reactions")
        .select("message_id, emoji, user_id")
        .eq("chat_id", id)
        .in("message_id", messageIds);
      return (rows ?? []) as ReactionRow[];
    })(),
    (async (): Promise<VoteRow[]> => {
      if (!messageIds.length) return [];
      const { data: rows } = await supabase
        .from(TABLE.CHAT_CHOICE_VOTES)
        .select("message_id, option_id, user_id")
        .eq("chat_id", id)
        .in("message_id", messageIds);
      return (rows ?? []) as VoteRow[];
    })(),
    (async (): Promise<{ rooms: NavRoom[]; rpcFailed: boolean }> => {
      if (!chatroom.world_id) return { rooms: [], rpcFailed: false };
      const { data: navRooms, error: navErr } = await supabase.rpc(
        "list_chatrooms_nav",
        { p_world_id: chatroom.world_id },
      );
      if (!navErr && navRooms) return { rooms: navRooms as NavRoom[], rpcFailed: false };
      // Fallback : requête directe si le RPC n'existe pas encore
      const { data: fallback } = await supabase
        .from(TABLE.CHATROOMS)
        .select("id, title, name, icon_url, updated_at")
        .eq("world_id", chatroom.world_id)
        .order("updated_at", { ascending: false });
      return {
        rooms: (fallback ?? []).map((r) => ({
          id: r.id,
          title: r.title ?? null,
          name: r.name ?? null,
          icon_url: r.icon_url ?? null,
          last_message_at: r.updated_at ?? null,
          unread_count: 0,
        })),
        rpcFailed: true,
      };
    })(),
    (async (): Promise<{ role: string } | null> => {
      if (!needMembership) return null;
      const { data } = await supabase
        .from("world_members")
        .select("role")
        .eq("world_id", chatroom.world_id!)
        .eq("user_id", userId)
        .maybeSingle();
      return data as { role: string } | null;
    })(),
    supabase
      .from("chatroom_follows")
      .select("chatroom_id")
      .eq("user_id", userId)
      .eq("chatroom_id", id)
      .maybeSingle(),
  ]);

  const byMessage = new Map<
    number,
    Map<string, { count: number; me: boolean }>
  >();

  for (const r of reactionRows) {
    const mid = Number(r.message_id);
    const emoji = String(r.emoji);
    const uid = String(r.user_id);

    if (!byMessage.has(mid)) byMessage.set(mid, new Map());
    const emMap = byMessage.get(mid)!;

    const prev = emMap.get(emoji) ?? { count: 0, me: false };
    emMap.set(emoji, {
      count: prev.count + 1,
      me: prev.me || uid === userId,
    });
  }

  const votesByMessage = new Map<number, VoteRow[]>();
  for (const r of voteRows) {
    const mid = Number(r.message_id);
    const arr = votesByMessage.get(mid) ?? [];
    arr.push(r);
    votesByMessage.set(mid, arr);
  }

  const initialMessagesWithReactions = await Promise.all(
    initialMessages.map(async (m) => {
      const emMap = byMessage.get(m.id);
      const reactions: ReactionSummary[] = emMap
        ? Array.from(emMap.entries())
            .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
            .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
        : [];
      const votes: ChoiceVoteSummary[] = aggregateChoiceVotes(votesByMessage.get(m.id) ?? [], userId);
      const content = chatroomKey
        ? await decryptMessage((m as { content?: string }).content ?? "", chatroomKey)
        : ((m as { content?: string }).content ?? "");
      return { ...m, content, reactions, votes };
    }),
  );
  /* reactions */

  // Droits d'édition / d'admin monde, dérivés des données déjà chargées.
  let canEdit = chatroom.created_by === userId;
  let canWorldAdmin = false;
  if (chatroom.world_id) {
    if (isWorldOwner) {
      canWorldAdmin = true;
      canEdit = true;
    } else if (membership && ["owner", "admin"].includes(membership.role)) {
      canWorldAdmin = true;
      canEdit = true;
    }
  }

  const canPost = canMemberPost(membership?.role ?? null, isWorldOwner);

  // Chatrooms du même world (pour l'aside), déjà chargés en phase 2.
  const initialRoomsSafe = navResult.rooms;

  return (
    <div className="flex h-full w-full min-h-0">
      {chatroom.world_id && <WorldSidebar worldId={chatroom.world_id} />}
      <ChatRoomView
        chatId={id}
      initialChat={{
        id: chatroom.id,
        title: chatroom.title ?? t("newRoom"),
        banner_url: chatroom.banner_url ?? null,
        icon_url: chatroom.icon_url ?? null,
        timeline_date: (chatroom.timeline_date as { year: number; month: number | null; day: number | null } | null) ?? null,
        map_pin_id: (chatroom.map_pin_id as string | null) ?? null,
        category_id: (chatroom.category_id as string | null) ?? null,
        worlds: (() => {
          const w = worldData;
          if (!w?.id) return null;
          const isShared = (w.world_members ?? []).some((m: { user_id: string }) => m.user_id !== w.owner_id);
          return {
            id: w.id, name: w.name, isShared,
            owner_id: w.owner_id ?? null,
            restrict_inventory: !!w.restrict_inventory,
            restrict_skills: !!w.restrict_skills,
            timeline_config: w.timeline_enabled ? (w.timeline_config as import("@/types/worlds").WorldTimelineConfig ?? null) : null,
          };
        })(),
      }}
      initialMessages={initialMessagesWithReactions as unknown as ChatMessageWithPersona[]}
      initialHasMore={initialHasMore}
      initialPersona={initialPersona}
      selfId={userId}
      canEdit={canEdit}
      canWorldAdmin={canWorldAdmin}
      canPost={canPost}
      initialChatrooms={initialRoomsSafe}
      chatroomKey={chatroomKey}
      initialIsFollowed={!!followRow.data}
    />
    </div>
  );
}
