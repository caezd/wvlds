import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar/Sidebar";
import SidebarRail from "@/components/sidebar/SidebarRail";
import SidebarLayout from "@/components/sidebar/SidebarLayout";
import { UserMenuButton } from "@/components/sidebar/UserMenuButton";

export default async function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  // Par défaut ouverte ; "false" si l'utilisateur l'a fermée
  const defaultOpen = cookieStore.get("sidebar_open")?.value !== "false";

  // Menu utilisateur (avatar) pour le header mobile — même menu que le footer sidebar
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let headerUserMenu: React.ReactNode = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url, username, plan")
      .eq("id", user.id)
      .single();
    headerUserMenu = (
      <UserMenuButton
        variant="compact"
        username={profile?.username ?? null}
        email={user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        plan={profile?.plan ?? null}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex h-full w-full flex-1 transition-colors z-0">
        <SidebarLayout
          sidebar={<Sidebar />}
          rail={<SidebarRail />}
          defaultOpen={defaultOpen}
          headerUserMenu={headerUserMenu}
        >
          {children}
        </SidebarLayout>
      </div>
    </div>
  );
}
