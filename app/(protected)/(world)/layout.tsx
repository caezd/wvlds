import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import WorldSidebar from "@/components/worlds/sidebar/WorldSidebar";
import { WorldSidebarSkeleton } from "@/components/worlds/sidebar/WorldSidebarSkeleton";
import { SidebarWorldProvider, SidebarWorldSlot } from "@/components/worlds/sidebar/SidebarWorld";
import { getCurrentUserId, getWorldById, getWorldMembership } from "@/lib/currentRequest";
import { PATHNAME_HEADER, chatIdFromPathname, worldIdFromPathname } from "@/lib/requestPath";
import { getChatroomWithWorld } from "./c/[id]/getChatroom";

/**
 * Layout commun aux pages d'un monde (`/w/[id]`) et à ses salons (`/c/[id]`).
 *
 * Il porte la barre latérale du monde. Next ne refait pas un layout partagé
 * quand on navigue entre ses enfants : passer de l'accueil d'un monde à l'un de
 * ses salons, et retour, ne rend plus que la page. Quand la barre vivait dans
 * deux layouts distincts (`w/[id]` et `c`), chaque aller-retour la refaisait
 * côté serveur — une dizaine de requêtes — et la remontait côté client, avec
 * ses canaux temps réel et son défilement.
 *
 * Ce layout ne reçoit pas les paramètres de ses enfants : il lit le chemin
 * transmis par le middleware (cf. lib/requestPath). Comme il ne se refait pas
 * d'une page à l'autre, la barre peut montrer un autre monde que la page —
 * en arrivant sur un salon ou un monde différent. `SidebarWorldGuard`, rendu
 * par les deux layouts enfants, le détecte et rafraîchit une fois ; d'ici là,
 * `SidebarWorldSlot` montre le squelette au lieu de la barre périmée.
 */
export default async function WorldAreaLayout({ children }: { children: ReactNode }) {
  const worldId = await sidebarWorldId((await headers()).get(PATHNAME_HEADER));

  return (
    <SidebarWorldProvider worldId={worldId}>
      <div className="flex h-full w-full min-h-0">
        {/* Ne se déclenche qu'à l'entrée dans un monde : ce layout reste monté
            ensuite, la barre ne repasse pas par son squelette. */}
        {worldId && (
          <SidebarWorldSlot>
            <Suspense fallback={<WorldSidebarSkeleton />}>
              <WorldSidebar worldId={worldId} />
            </Suspense>
          </SidebarWorldSlot>
        )}
        {children}
      </div>
    </SidebarWorldProvider>
  );
}

/**
 * Monde dont on affiche la barre, ou null.
 *
 * Salon : le monde du salon, comme le faisait le layout des salons. Page de
 * monde : seulement si `w/[id]/layout.tsx` laisse entrer — membre, et âge
 * confirmé pour un monde réservé. Sinon il rend une 404 ou l'écran d'âge, que
 * la barre n'avait jamais accompagnés. Toutes ces lectures sont mémoïsées pour
 * la requête : la page les relit sans nouvelle requête.
 */
async function sidebarWorldId(pathname: string | null): Promise<string | null> {
  const chatId = chatIdFromPathname(pathname);
  if (chatId) return (await getChatroomWithWorld(chatId)).data?.world_id ?? null;

  const worldId = worldIdFromPathname(pathname);
  if (!worldId) return null;
  const [world, userId, { membership }] = await Promise.all([
    getWorldById(worldId),
    getCurrentUserId(),
    getWorldMembership(worldId),
  ]);
  if (!world || !membership) return null;
  if (world.is_age_restricted) {
    const confirmed = (world.world_members ?? []).find((m) => m.user_id === userId)?.age_confirmed_at;
    if (!confirmed) return null;
  }
  return worldId;
}
