// app/(site)/worlds/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { Globe, GlobeLock } from "lucide-react";

import { WorldChatComposer } from "@/components/worlds/WorldChatComposer";
import { WorldChatroomsList } from "@/components/worlds/WorldChatroomsList";
import { WorldTabs } from "@/components/worlds/WorldTabs";
import { Suspense } from "react";

import { WorldHeader } from "@/components/worlds/WorldHeader";
import WorldChatroomsAside from "@/components/worlds/WorldChatroomsAside";

/* function WorldHeader({
    world,
    canAdmin,
}: {
    world: {
        id: string;
        owner_id: string;
        name: string;
    };
    canAdmin: boolean;
}) {
    return (
        <header className="flex draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-token-main-surface-primary pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition max-md:hidden [box-shadow:var(--sharp-edge-top-shadow-placeholder)] bg-background">
            <div className="pointer-events-none absolute start-0 flex flex-col items-center gap-2 lg:start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2">
                open button mobile
            </div>
            <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center">
                    <a
                        href=""
                        className="hover:bg-hover-400 focus-visible:outline-token-outline-primary text-token-text-secondary ms-2 inline-flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        <Globe size={20} className="icon" />
                    </a>
                    <ChevronRight size={16} className="icon-sm text-white/40" />
                    <WorldEditDialog
                        world={world}
                        trigger={<Button>{world.name}</Button>}
                    />
                </div>
                <WorldInviteDialog
                    ownerId={world.owner_id}
                    worldId={world.id}
                    canManage={!!canAdmin}
                />
            </div>
        </header>
    );
} */

export default async function WorldPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: world } = await supabase
    .from("worlds")
    .select("id, name, description, owner_id, banner_url")
    .eq("id", id)
    .single();
  const { data: me } = await supabase.auth.getUser();

  if (!world) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Monde introuvable</div>
    );
  }

  const selfId = me.user?.id ?? "";
  const { data: navRooms, error: navErr } = await supabase.rpc(
    "list_chatrooms_nav",
    {
      p_world_id: id,
    },
  );
  const initialRooms = navErr ? [] : (navRooms ?? []);

  const { data: canAdmin } = await supabase.rpc("is_world_admin", {
    wid: world.id,
    uid: me.user?.id ?? null,
  });
  const members = world.world_members ?? [];
  const isShared = members.some((m) => m.user_id !== world.owner_id);

  return (
    <main className="composer-parent flex focus-visible:outline-0 h-full">
      <WorldChatroomsAside
        worldId={world?.id ?? ""}
        selfId={selfId}
        currentChatId={null}
        initialRooms={initialRooms}
      />

      <div className="flex flex-col focus-visible:outline-0 h-full flex-1">
        <WorldHeader world={world} canAdmin={!!canAdmin} />
        <div>
          <div className="flex min-h-full">
            <div className="text-base mx-auto [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)] px-(--thread-content-margin)">
              <div className="[--thread-content-max-width:40rem] thread-lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 grid h-full [width:min(90cqw,var(--thread-content-max-width))] flex-1 grid-rows-[auto_min-content_min-content]">
                <div className="flex min-w-0 flex-col gap-8 pb-6 mt-13 self-start max-md:mt-0">
                  <div className="offset-padding-top-4 sticky top-(--header-height) z-10 flex flex-col gap-[inherit] max-md:top-0 md:[--offset-y-bottom:-30px] content-fade-top bg-background">
                    <div className="flex justify-between max-md:flex-col max-md:gap-4">
                      <div className="absolute -z-10 -top-8 -left-10 -right-10 mask-b-from-0% to-100% bg-muted">
                        <img
                          src={world.banner_url}
                          alt="Banner"
                          width={800}
                          height={200}
                          className="relative max-h-36 object-cover -z-10 rounded-md opacity-50"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 max-md:-translate-x-1">
                        <button className="dropdown-btn group relative col-1 row-1 ms-[3px] ms-0! [--focus-outline-margin:-4px] disabled:cursor-default! disabled:opacity-100!">
                          {isShared ? (
                            <Globe
                              size={20}
                              className="icon h-8 w-8 max-md:h-6 max-md:w-[28px] max-md:h-[28px]"
                            />
                          ) : (
                            <GlobeLock
                              size={20}
                              className="icon h-8 w-8 max-md:h-6 max-md:w-[28px] max-md:h-[28px]"
                            />
                          )}
                        </button>
                        <button className="min-w-0">
                          <h1 className="md:text-page-header text-balance [--text-lg--line-height:28px] [--text-lg:22px] max-md:text-lg max-md:font-normal">
                            {world.name}
                          </h1>
                        </button>
                      </div>
                    </div>
                    <Suspense>
                      <WorldTabs
                        worldId={id}
                        canEdit={true /* calcule selon rôle */}
                      />
                    </Suspense>
                    <WorldChatComposer worldId={id} />
                  </div>
                  {/*  <WorldChatroomsList
                    worldId={id}
                    initialChatrooms={initialRooms}
                    />*/}
                  {world.description && (
                    <p className="mt-2 text-muted-foreground">
                      {world.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
