import type { ReactNode } from "react";
import { SidebarWorldGuard } from "@/components/worlds/sidebar/SidebarWorld";
import { WorldLiveChatAnchor } from "@/components/worlds/live-chat/WorldLiveChatAnchor";
import { getCurrentUserId } from "@/lib/currentRequest";
import { getChatroomWithWorld } from "./getChatroom";

/**
 * Layout d'un salon. La barre latérale du monde vit dans le layout parent
 * (`app/(protected)/c/layout.tsx`), qui reste monté d'un salon à l'autre ;
 * celui-ci vérifie seulement qu'elle montre bien le monde de ce salon.
 *
 * `getChatroomWithWorld` est mémoïsée pour la requête : la page la relit sans
 * nouvelle requête.
 */
export default async function ChatRoomLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: chatroom }, userId] = await Promise.all([getChatroomWithWorld(id), getCurrentUserId()]);

  // Le chat en direct du monde n'est proposé qu'à ses membres : un salon
  // public peut être lu par un visiteur, le chat du monde non (RLS, migration 202).
  const world = chatroom?.worlds as { owner_id?: string; world_members?: { user_id: string }[] } | null | undefined;
  const isWorldMember =
    !!userId && !!world && (world.owner_id === userId || (world.world_members ?? []).some((m) => m.user_id === userId));

  return (
    <>
      <SidebarWorldGuard worldId={chatroom?.world_id ?? null} />
      {chatroom?.world_id && isWorldMember && <WorldLiveChatAnchor worldId={chatroom.world_id} />}
      {children}
    </>
  );
}
