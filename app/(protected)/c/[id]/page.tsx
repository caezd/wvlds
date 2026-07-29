import { Suspense } from "react";
import ChatRoomContent from "./ChatRoomContent";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { notFound } from "next/navigation";
import { PageSpinner } from "@/components/ui/page-spinner";
import { getTranslations } from "next-intl/server";
import { getChatroomWithWorld } from "./getChatroom";

export default async function Page({ params }: { params: { id: string } }) {
  const t = await getTranslations("chatrooms");
  const { id } = await params;
  const supabase = await createClient();

  const userId = await getUserId(supabase);

  if (!userId) {
    notFound();
  }

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
