import ChatRoomView from "./view";
import { createClient } from "@/lib/supabase/server";
import { TABLE, CHAT_MESSAGES_PAGE_SIZE } from "@/lib/constants";
import { decryptMessage } from "@/lib/crypto";
import { aggregateChoiceVotes } from "@/lib/choiceVotes";
import type { ChatMessageWithPersona, Persona, ChoiceVoteSummary } from "@/types/db";
import { canMemberPost, canEditChatroom, canManageWorld } from "@/lib/worldPermissions";
import { getChatroomsNav, getFollowedChatroomIds, type NavRoom } from "@/lib/currentRequest";
import type { ChatroomWithWorld } from "./getChatroom";

export default async function ChatRoomContent({
  id,
  userId,
  chatroom,
  newRoomLabel,
}: {
  id: string;
  userId: string;
  chatroom: ChatroomWithWorld;
  newRoomLabel: string;
}) {
  const supabase = await createClient();

  // Requêtes ne dépendant que de `id`/`userId`, indépendantes entre elles →
  // chargées en parallèle (messages, clé de chiffrement, persona préférée).
  const [{ data: messages }, { data: keyRow }, { data: pref }] = await Promise.all([
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

  // Requêtes dépendant de ce qui précède (messageIds, world_id) mais
  // indépendantes entre elles → en parallèle : réactions, nav des salons du
  // monde, et rôle de l'utilisateur dans le monde (si nécessaire).
  type ReactionRow = { message_id: number; emoji: string; user_id: string };
  type VoteRow = { message_id: number; option_id: string; user_id: string };

  const [reactionRows, voteRows, navRooms, membership, followedIds, personaGroupColors, challengeBadges] = await Promise.all([
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
    // Mémoïsé pour la requête et partagé avec `WorldSidebar` (monté par le
    // layout) : c'est la requête la plus lourde du chemin chaud, elle était
    // payée deux fois par rendu. Le repli défensif vit désormais dans le getter.
    chatroom.world_id ? getChatroomsNav(chatroom.world_id) : Promise.resolve([] as NavRoom[]),
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
    // Mémoïsé et partagé avec `WorldSidebar`, qui charge de toute façon la liste
    // complète des salons suivis pour sa section « Suivi ».
    getFollowedChatroomIds(),
    // Couleurs de groupe des personas du monde. Chargées ici plutôt que dans un
    // effet au montage : c'était un aller-retour réseau de plus après
    // l'hydratation, pour une donnée que le serveur pouvait joindre au rendu.
    (async (): Promise<Record<string, string>> => {
      if (!chatroom.world_id) return {};
      type AssignRow = { persona_id: string; group: { color: string } | null };
      const { data } = await supabase
        .from("persona_group_assignments")
        .select("persona_id, group:group_id(color)")
        .eq("world_id", chatroom.world_id);
      const out: Record<string, string> = {};
      for (const row of ((data ?? []) as unknown as AssignRow[])) {
        if (row.group?.color) out[row.persona_id] = row.group.color;
      }
      return out;
    })(),
    // Badges « défi remporté » des messages affichés — même raison. L'effet
    // client subsiste pour le Realtime et pour les pages d'historique.
    (async (): Promise<[number, { title: string; description: string | null }][]> => {
      if (!messageIds.length) return [];
      type Row = { message_id: number; challenge: { title: string; description: string | null } | null };
      const { data } = await supabase
        .from(TABLE.CHALLENGE_ATTEMPTS)
        .select("message_id, challenge:challenge_id(title, description)")
        .in("message_id", messageIds)
        .eq("status", "won");
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.challenge)
        .map((r) => [Number(r.message_id), r.challenge!]);
    })(),
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
  // Règles partagées avec le reste de l'app (lib/worldPermissions.ts), elles-
  // mêmes alignées sur les policies RLS (`chatrooms_update_authenticated_merged`,
  // `is_world_editor`) — sinon le client cache des actions pourtant permises en base.
  const isCreator = chatroom.created_by === userId;
  const role = membership?.role ?? null;
  const canEdit = canEditChatroom(isCreator, role, isWorldOwner);
  const canWorldAdmin = canManageWorld(role, isWorldOwner);

  const canPost = canMemberPost(role, isWorldOwner);

  // Chatrooms du même world (pour l'aside), déjà chargés ci-dessus.
  const initialRoomsSafe = navRooms;

  return (
    <ChatRoomView
      chatId={id}
      initialChat={{
        id: chatroom.id,
        title: chatroom.title ?? newRoomLabel,
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
      initialIsFollowed={followedIds.has(id)}
      initialPersonaGroupColors={personaGroupColors}
      initialChallengeBadges={challengeBadges}
    />
  );
}
