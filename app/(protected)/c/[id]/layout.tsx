import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import WorldSidebar from "@/components/worlds/sidebar/WorldSidebar";
import { withRouteMessages } from "@/lib/clientMessages";
import { getChatroomWithWorld } from "./getChatroom";
import { getCurrentUserId } from "@/lib/currentRequest";
import { WorldLiveChatAnchor } from "@/components/worlds/live-chat/WorldLiveChatAnchor";

export default async function ChatRoomLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: chatroom }, locale, messages, userId] = await Promise.all([
    getChatroomWithWorld(id),
    getLocale(),
    getMessages(),
    getCurrentUserId(),
  ]);

  // Le chat en direct du monde n'est proposé qu'à ses membres : un salon
  // public peut être lu par un visiteur, le chat du monde non (RLS, migration 202).
  const world = chatroom?.worlds as { owner_id?: string; world_members?: { user_id: string }[] } | null | undefined;
  const isWorldMember =
    !!userId && !!world && (world.owner_id === userId || (world.world_members ?? []).some((m) => m.user_id === userId));

  // Ce layout n'est pas enveloppé par le `loading.tsx` du segment (seul
  // `page.tsx` l'est) : la sidebar reste donc montée et cliquable pendant
  // qu'on navigue d'un chatroom à l'autre, au lieu de disparaître avec le
  // reste de la page à chaque changement de salon.
  // `catalogue` : la fiche d'un objet s'ouvre depuis l'inventaire d'un persona
  // consulté dans le salon (migration 186) — c'est le seul onglet de monde
  // que le salon lit ; wiki, carte et relations restent à /w/[id].
  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["catalogue"])}>
      <div className="flex h-full w-full min-h-0">
        {chatroom?.world_id && <WorldSidebar worldId={chatroom.world_id} />}
        {chatroom?.world_id && isWorldMember && <WorldLiveChatAnchor worldId={chatroom.world_id} />}
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
