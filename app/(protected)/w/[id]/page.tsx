// app/(protected)/w/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

import { WorldHome } from "@/components/worlds/WorldHome";
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
      "id, name, description, owner_id, banner_url, icon_url, color, visibility, world_members(user_id, role)",
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
      <div className="flex min-h-0 w-full flex-1 flex-row gap-3">
        <WorldHome
          world={world}
          worldId={id}
          canAdmin={!!canAdmin}
          isShared={isShared}
          canEditTabs={canEditTabs}
          canPost={canPost}
          initialRooms={initialRooms}
        />
      </div>
    </main>
  );
}
