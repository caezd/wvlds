import { Suspense } from "react";
import ChatRoomContent from "./ChatRoomContent";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { notFound } from "next/navigation";
import { PageSpinner } from "@/components/ui/page-spinner";
import { getTranslations } from "next-intl/server";
import { getChatroomWithWorld } from "./getChatroom";
import { getChatroomMessages } from "./getChatroomMessages";

/**
 * Titre d'onglet = nom du salon. `getChatroomWithWorld` est mémoïsé pour la
 * requête (React `cache()`) et déjà appelé par la page : aucune requête
 * supplémentaire. Sans ça, tous les onglets s'appelaient « WVLDS » — gênant
 * dès qu'on en ouvre plusieurs sur des salons différents.
 */
export async function generateMetadata({ params }: { params: { id: string } }) {
  const { id } = await params;
  const { data } = await getChatroomWithWorld(id);
  const title = data?.title ?? data?.name ?? null;
  const world = Array.isArray(data?.worlds) ? data?.worlds[0] : data?.worlds;
  if (!title) return {};
  return { title: world?.name ? `${title} — ${world.name}` : title };
}

export default async function Page({ params }: { params: { id: string } }) {
  const t = await getTranslations("chatrooms");
  const { id } = await params;
  const supabase = await createClient();

  const userId = await getUserId(supabase);

  if (!userId) {
    notFound();
  }

  // Préchargement : messages, clé et persona préférée ne dépendent que de
  // l'id du salon. On les lance MAINTENANT, sans les attendre, pour qu'ils
  // chargent pendant la lecture du salon ci-dessous ; `ChatRoomContent`
  // récupère la même promesse (mémoïsée pour la requête). Le `.catch` ne
  // sert qu'à éviter un rejet non géré si l'on sort par `notFound()` avant
  // que quiconque ne l'attende — il ne modifie pas la promesse mémoïsée.
  getChatroomMessages(id, userId).catch(() => {});

  // Mémoïsée (React cache()) : `layout.tsx` l'a déjà chargée pour la
  // sidebar, donc pas de requête supplémentaire ici.
  const { data: chatroom, error: chatErr } = await getChatroomWithWorld(id);

  if (chatErr || !chatroom) return notFound();

  return (
    <Suspense fallback={<PageSpinner />}>
      <ChatRoomContent
        id={id}
        userId={userId}
        chatroom={chatroom}
        newRoomLabel={t("newRoom")}
      />
    </Suspense>
  );
}
