// app/(protected)/w/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorldChatComposer } from "@/components/worlds/WorldChatComposer";
import { WorldHeroCard } from "@/components/worlds/WorldHeroCard";
import { WorldAboutTabs } from "@/components/worlds/WorldAboutTabs";
import { WorldChatroomsGrid } from "@/components/worlds/WorldChatroomsGrid";
import { WorldMembershipGuard } from "@/components/worlds/WorldMembershipGuard";

export default async function WorldPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: world } = await supabase
    .from("worlds")
    .select(
      "id, name, description, owner_id, banner_url, icon_url, color, world_members(user_id, role)",
    )
    .eq("id", id)
    .single();
  const { data: me } = await supabase.auth.getUser();

  if (!world) {
    // Monde inexistant ou accès perdu (ex. membre retiré)
    notFound();
  }

  type NavRoom = {
    id: string;
    title: string | null;
    name: string | null;
    icon_url: string | null;
    last_message_at: string | null;
    unread_count: number;
  };

  const { data: navRooms } = await supabase.rpc("list_chatrooms_nav", {
    p_world_id: id,
  });
  const initialRooms: NavRoom[] = (navRooms as NavRoom[] | null) ?? [];

  const { data: canAdmin } = await supabase.rpc("is_world_admin", {
    wid: world.id,
    uid: me.user?.id ?? null,
  });
  const members = world.world_members ?? [];
  const isShared = members.some((m) => m.user_id !== world.owner_id);

  // Permissions selon le rôle du membre courant
  const myRole =
    members.find((m) => m.user_id === me.user?.id)?.role ??
    (world.owner_id === me.user?.id ? "owner" : null);
  const canEditTabs = ["owner", "admin", "editor"].includes(myRole ?? "");
  const canPost = ["owner", "admin", "editor", "player"].includes(
    myRole ?? "",
  );

  return (
    <main className="composer-parent flex h-full flex-col focus-visible:outline-0">
      <WorldMembershipGuard
        worldId={world.id}
        selfId={me.user?.id ?? null}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 pb-12 pt-6 md:px-8">
        {/* -- Hero — bannière, invitation, édition au survol ----- */}
        <WorldHeroCard
          world={world}
          canAdmin={!!canAdmin}
          isShared={isShared}
        />

        {/* -- Onglets descriptifs créés par les membres ---------- */}
        <Suspense>
          <WorldAboutTabs worldId={id} canEdit={canEditTabs} />
        </Suspense>

        {/* -- Parties (chatrooms) -------------------------------- */}
        <section id="parties" className="flex flex-col gap-4">
          {canPost && <WorldChatComposer worldId={id} />}
          <WorldChatroomsGrid worldId={id} initialRooms={initialRooms} />
        </section>
      </div>
    </main>
  );
}
