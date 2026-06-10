import { cookies } from "next/headers";
import Sidebar from "@/components/sidebar/Sidebar";
import SidebarRail from "@/components/sidebar/SidebarRail";
import SidebarLayout from "@/components/sidebar/SidebarLayout";

export default async function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  // Par défaut ouverte ; "false" si l'utilisateur l'a fermée
  const defaultOpen = cookieStore.get("sidebar_open")?.value !== "false";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex h-full w-full flex-1 transition-colors z-0">
        <SidebarLayout
          sidebar={<Sidebar />}
          rail={<SidebarRail />}
          defaultOpen={defaultOpen}
        >
          {children}
        </SidebarLayout>
      </div>
    </div>
  );
}
