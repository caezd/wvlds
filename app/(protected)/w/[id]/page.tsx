// app/(protected)/w/[id]/page.tsx
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { getWorldById } from "@/lib/currentRequest";
import { notFound } from "next/navigation";
import { PageSpinner } from "@/components/ui/page-spinner";
import WorldHomeContent from "./WorldHomeContent";

export default async function WorldPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { view?: string; category?: string };
}) {
  const { id } = await params;
  const supabase = await createClient();

  // `getWorldById`/l'accès sont déjà validés par `layout.tsx` (mémoïsés via
  // React cache(), donc pas de requête supplémentaire) — on les revérifie
  // simplement ici pour que ce fichier reste sûr indépendamment du layout.
  const [world, userId] = await Promise.all([
    getWorldById(id),
    getUserId(supabase),
  ]);

  if (!world) {
    notFound();
  }

  const members = world.world_members ?? [];
  const myRole =
    members.find((m) => m.user_id === userId)?.role ??
    (world.owner_id === userId ? "owner" : null);

  if (!myRole) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams?.view;
  const initialCategoryId = resolvedSearchParams?.category ?? null;

  return (
    <Suspense fallback={<PageSpinner />}>
      <WorldHomeContent
        world={world}
        worldId={id}
        myRole={myRole}
        view={view}
        initialCategoryId={initialCategoryId}
      />
    </Suspense>
  );
}
