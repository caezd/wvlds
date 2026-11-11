import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import WorldSidebar from "@/components/worlds/sidebar/WorldSidebar";
import { WorldSidebarSkeleton } from "@/components/worlds/sidebar/WorldSidebarSkeleton";
import { SidebarWorldProvider } from "@/components/worlds/sidebar/SidebarWorld";
import { withRouteMessages } from "@/lib/clientMessages";
import { PATHNAME_HEADER, chatIdFromPathname } from "@/lib/requestPath";
import { getChatroomWithWorld } from "./[id]/getChatroom";

/**
 * Layout commun à tous les salons, AU-DESSUS du segment `[id]`.
 *
 * Next ne refait pas un layout partagé quand on navigue entre ses enfants :
 * passer d'un salon à l'autre ne rend plus que le salon. La barre latérale du
 * monde — une dizaine de requêtes, ses canaux temps réel, son défilement —
 * était jusqu'ici dans le layout `[id]`, recréé à chaque salon.
 *
 * Ce layout ne reçoit pas l'id du salon (paramètre d'un segment enfant) : il
 * le lit dans le chemin transmis par le middleware. S'il manque, pas de barre
 * latérale ; `SidebarWorldGuard` (rendu par le salon) rafraîchit alors une
 * fois, comme lorsqu'on arrive sur un salon d'un autre monde.
 */
export default async function ChatroomsLayout({ children }: { children: ReactNode }) {
  const chatId = chatIdFromPathname((await headers()).get(PATHNAME_HEADER));
  const [chatroom, locale, messages] = await Promise.all([
    // Mémoïsée pour la requête : le layout `[id]` et la page la relisent sans
    // nouvelle requête lors d'un rendu complet.
    chatId ? getChatroomWithWorld(chatId).then((r) => r.data) : Promise.resolve(null),
    getLocale(),
    getMessages(),
  ]);
  const worldId = chatroom?.world_id ?? null;

  // `catalogue` : la fiche d'un objet s'ouvre depuis l'inventaire d'un persona
  // consulté dans le salon (migration 186) — c'est le seul onglet de monde
  // que le salon lit ; wiki, carte et relations restent à /w/[id].
  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, ["catalogue"])}>
      <SidebarWorldProvider worldId={worldId}>
        <div className="flex h-full w-full min-h-0">
          {/* Ne se déclenche qu'à l'entrée dans les salons : ce layout reste
              monté ensuite, la barre ne repasse pas par son squelette. */}
          {worldId && (
            <Suspense fallback={<WorldSidebarSkeleton />}>
              <WorldSidebar worldId={worldId} />
            </Suspense>
          )}
          {children}
        </div>
      </SidebarWorldProvider>
    </NextIntlClientProvider>
  );
}
