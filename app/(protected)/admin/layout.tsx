import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // redirect si non-admin

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-20 border-b border-border-soft bg-background px-6 h-12 flex items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Admin
        </span>
        <nav className="flex items-center gap-3 text-sm">
          <a href="/admin/shop" className="hover:underline">Boutique</a>
          <a href="/admin/users" className="hover:underline text-muted-foreground">Utilisateurs</a>
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
