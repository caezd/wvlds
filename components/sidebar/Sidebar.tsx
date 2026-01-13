import { createClient } from "@/lib/supabase/server";
import WorldsSidebarClient from "./WorldsSidebarClient";
import { getUserQuotaServer } from "@/lib/userQuota";
import { ThemeSwitcher } from "../theme-switcher";
import { Button } from "../ui/button";

type WorldRow = {
  id: string;
  name: string;
  slug: string | null;
  is_archived: boolean;
  owner_id: string;
  world_members: {
    user_id: string;
    role: "owner" | "admin" | "editor" | "player" | "viewer";
  }[];
};

export default async function Sidebar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Connecte-toi pour voir tes mondes.
      </div>
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: worlds, error } = (await supabase
    .from("worlds")
    .select(
      `
            id, name, slug, is_archived, owner_id,
            world_members ( user_id, role )
            `,
    )
    .order("name", { ascending: true })) as {
    data: WorldRow[] | null;
    error: any;
  };

  if (error) {
    console.log(error);
    return (
      <div className="p-4 text-sm text-destructive">
        Erreur de chargement des mondes.
      </div>
    );
  }

  // Mon plan + nb de mondes possédés (pour l’indicateur quota)
  const { plan, owned, quotaLimit, quotaReached } =
    await getUserQuotaServer("worlds");

  const mine = (worlds ?? []).filter((w) =>
    w.world_members?.some((m) => m.user_id === user.id && m.role === "owner"),
  );
  const shared = (worlds ?? []).filter(
    (w) =>
      !w.world_members?.some(
        (m) => m.user_id === user.id && m.role === "owner",
      ),
  );

  return (
    <>
      <WorldsSidebarClient
        meId={user.id}
        plan={plan}
        ownedCount={owned}
        quotaLimit={quotaLimit}
        quotaReached={quotaReached}
        mine={mine}
        shared={shared}
      />
      <div className="grow"></div>
      <div className="sticky bottom-0 z-30 empty:hidden py-1.5 border-t">
        <div className="relative">
          <Button className="hover:bg-hover-400 flex mx-1.5 max-w-[calc(100%-var(--spacing)*3)] min-h-10 px-2 py-1.5 w-full justify-start">
            <div className="min-w-0">
              <div className="flex min-w-0 grow items-center gap-2.5 group-data-no-contents-gap:gap-0 text-sm">
                <div className="truncate">{profile.username || user.email}</div>
              </div>
              <div className="flex min-w-0 grow text-muted-foreground leading-dense mb-0.5 text-xs group-data-sheet-item:mt-0.5 group-data-sheet-item:mb-0">
                <div className="truncate">{plan}</div>
              </div>
            </div>
          </Button>
          <ThemeSwitcher />
        </div>
      </div>
    </>
  );
}
