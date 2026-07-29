// app/(protected)/w/[id]/layout.tsx
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { getWorldById } from "@/lib/currentRequest";
import { notFound } from "next/navigation";

import { AgeGate } from "@/components/worlds/AgeGate";
import { WorldMembershipGuard } from "@/components/worlds/members/WorldMembershipGuard";
import WorldSidebar from "@/components/worlds/sidebar/WorldSidebar";

export default async function WorldLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const { id } = await params;
  const supabase = await createClient();

  // La requête `world` (RLS) et l'id utilisateur (vérification locale du JWT)
  // sont indépendants → on les résout en parallèle. `getWorldById` est
  // mémoïsé (React cache()) : `page.tsx` et `WorldSidebar` la réutilisent
  // sans requête supplémentaire.
  const [world, userId] = await Promise.all([
    getWorldById(id),
    getUserId(supabase),
  ]);

  if (!world) {
    notFound();
  }

  // Only members (or the owner) can access the world page.
  // Invitees can read the world record (via RLS policy) but cannot enter.
  const members = world.world_members ?? [];
  const myRole =
    members.find((m) => m.user_id === userId)?.role ??
    (world.owner_id === userId ? "owner" : null);

  if (!myRole) {
    notFound();
  }

  const myAgeConfirmedAt = members.find((m) => m.user_id === userId)?.age_confirmed_at ?? null;
  if (world.is_age_restricted && !myAgeConfirmedAt) {
    return <AgeGate worldId={world.id} worldName={world.name} />;
  }

  // Ce layout n'est pas enveloppé par le `loading.tsx` du segment (seul
  // `page.tsx` l'est) : la sidebar reste donc montée et cliquable pendant
  // qu'on navigue entre deux vues du même monde.
  return (
    <main className="composer-parent flex h-full flex-col focus-visible:outline-0">
      <WorldMembershipGuard worldId={world.id} selfId={userId ?? null} />
      <div className="flex min-h-0 w-full flex-1 flex-row">
        <WorldSidebar worldId={id} />
        {children}
      </div>
    </main>
  );
}
