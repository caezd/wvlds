import ChatRoomView from "./view";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessageWithPersona } from "@/types/db";
import { canEditChatroom, hasWorldPermission } from "@/lib/worldPermissions";
import { getChatroomsNav, getFollowedChatroomIds, getWorldMembership, type NavRoom, type WorldMembershipData } from "@/lib/currentRequest";
import type { ChatroomWithWorld } from "./getChatroom";
import { getChatroomMessages } from "./getChatroomMessages";
import { decorateMessagePage } from "@/lib/chatMessagePage";
import { WikiLinkProvider } from "@/components/worlds/wiki/WikiLinkContext";
import { WorldMembershipProvider } from "@/components/providers/WorldMembershipProvider";

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

  // Messages (avec réactions, votes et badges joints), clé de chiffrement et
  // persona préférée : déjà en vol, démarrés par `page.tsx` en même temps que
  // la lecture du salon (cf. getChatroomMessages). Les lectures qui ont
  // besoin du `world_id` partent ici, en parallèle de la fin de celles-là —
  // il n'y a plus de seconde vague attendant les ids des messages.
  // Données du monde associé (extracted pour usage multiple)
  const rawWorld = chatroom.worlds as unknown;
  const worldData = (Array.isArray(rawWorld) ? rawWorld[0] : rawWorld) as { id: string; name: string; owner_id?: string; restrict_inventory?: boolean | null; restrict_skills?: boolean | null; timeline_enabled?: boolean | null; timeline_config?: unknown; world_members?: { user_id: string }[] } | null | undefined;

  const [messagesData, navRooms, worldMembership, followedIds, personaGroupColors] = await Promise.all([
    getChatroomMessages(id, userId),
    // Mémoïsé pour la requête et partagé avec `WorldSidebar` (monté par le
    // layout) : c'est la requête la plus lourde du chemin chaud, elle était
    // payée deux fois par rendu. Le repli défensif vit désormais dans le getter.
    chatroom.world_id ? getChatroomsNav(chatroom.world_id) : Promise.resolve([] as NavRoom[]),
    // Mémoïsé et partagé avec `WorldSidebar`.
    chatroom.world_id
      ? getWorldMembership(chatroom.world_id)
      : Promise.resolve({ roles: [], membership: null } as WorldMembershipData),
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
  ]);

  const {
    messages: initialMessages,
    hasMore: initialHasMore,
    reactionRows,
    voteRows,
    // Badges « défi remporté » des messages affichés. L'effet client subsiste
    // pour le Realtime et pour les pages d'historique.
    challengeBadges,
    chatroomKey,
    initialPersona,
  } = messagesData;

  const initialMessagesWithReactions = await decorateMessagePage(
    initialMessages,
    { reactionRows, voteRows },
    userId,
    chatroomKey,
  );

  // Droits d'édition / d'admin monde, dérivés des données déjà chargées.
  // Règles partagées avec le reste de l'app (lib/worldPermissions.ts), elles-
  // mêmes alignées sur les policies RLS (`chatrooms_update`, `chat_messages_insert`)
  // — sinon le client cache des actions pourtant permises en base.
  const isCreator = chatroom.created_by === userId;
  const { membership, roles: worldRoles } = worldMembership;
  const canEdit = canEditChatroom(isCreator, membership);
  const canWorldAdmin = hasWorldPermission(membership, "world.settings");

  const canPost = hasWorldPermission(membership, "messages.post");

  // Chatrooms du même world (pour l'aside), déjà chargés ci-dessus.
  const initialRoomsSafe = navRooms;

  return (
    // Les `[[liens]]` d'un message mènent au wiki du monde — sans monde,
    // ils restent visiblement cassés, comme avant.
    <WorldMembershipProvider
      worldId={chatroom.world_id ?? ""}
      ownerId={worldData?.owner_id ?? ""}
      userId={userId}
      isMember={!!membership}
      roles={worldRoles}
      myRoleIds={membership?.roles.map((r) => r.id) ?? []}
    >
    <WikiLinkProvider worldId={chatroom.world_id ?? ""}>
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
      renderedAt={Date.now()}
    />
    </WikiLinkProvider>
    </WorldMembershipProvider>
  );
}
