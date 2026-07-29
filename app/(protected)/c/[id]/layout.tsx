import type { ReactNode } from "react";
import WorldSidebar from "@/components/worlds/sidebar/WorldSidebar";
import { getChatroomWithWorld } from "./getChatroom";

export default async function ChatRoomLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: chatroom } = await getChatroomWithWorld(id);

  // Ce layout n'est pas enveloppé par le `loading.tsx` du segment (seul
  // `page.tsx` l'est) : la sidebar reste donc montée et cliquable pendant
  // qu'on navigue d'un chatroom à l'autre, au lieu de disparaître avec le
  // reste de la page à chaque changement de salon.
  return (
    <div className="flex h-full w-full min-h-0">
      {chatroom?.world_id && <WorldSidebar worldId={chatroom.world_id} />}
      {children}
    </div>
  );
}
