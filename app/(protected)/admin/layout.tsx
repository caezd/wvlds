import { requireAdmin } from "@/lib/admin";
import { ScrollArea } from "@/components/ui/scroll-area";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // redirect si non-admin

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <main className="mx-auto w-full max-w-6xl p-6">
          {children}
        </main>
      </ScrollArea>
    </div>
  );
}
