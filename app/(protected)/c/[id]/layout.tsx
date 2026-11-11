import type { ReactNode } from "react";
import { SidebarWorldGuard } from "@/components/worlds/sidebar/SidebarWorld";
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
  const { data: chatroom } = await getChatroomWithWorld(id);

  return (
    <>
      <SidebarWorldGuard worldId={chatroom?.world_id ?? null} />
      {children}
    </>
  );
}
