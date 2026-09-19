// app/(protected)/w/[id]/layout.tsx
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { getWorldById, getWorldMembership } from "@/lib/currentRequest";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { WORLD_ROUTE_NAMESPACES, withRouteMessages } from "@/lib/clientMessages";

import { AgeGate } from "@/components/worlds/AgeGate";
import { WorldMembershipGuard } from "@/components/worlds/members/WorldMembershipGuard";
import { WorldMembershipProvider } from "@/components/providers/WorldMembershipProvider";
import WorldSidebar from "@/components/worlds/sidebar/WorldSidebar";

export default async function WorldLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // La requête `world` (RLS) et l'id utilisateur (vérification locale du JWT)
  // sont indépendants → on les résout en parallèle. `getWorldById` est
  // mémoïsé (React cache()) : `page.tsx` et `WorldSidebar` la réutilisent
  // sans requête supplémentaire.
  const [world, userId, locale, messages, { roles, membership }] = await Promise.all([
    getWorldById(id),
    getUserId(supabase),
    getLocale(),
    getMessages(),
    getWorldMembership(id),
  ]);

  if (!world) {
    notFound();
  }

  // Only members (or the owner) can access the world page.
  // Invitees can read the world record (via RLS policy) but cannot enter.
  const members = world.world_members ?? [];

  if (!membership) {
    // Dire lequel des deux manque : l'identité (jeton expiré, session perdue)
    // ou l'appartenance. Les deux rendaient le même 404 muet, impossible à
    // distinguer depuis les journaux.
    console.error(
      "[WorldLayout] entrée refusée — monde %s, utilisateur %s, %d membre(s) lisible(s)",
      id,
      userId ?? "INCONNU (aucune identité dans le jeton)",
      members.length,
    );
    notFound();
  }

  const myAgeConfirmedAt = members.find((m) => m.user_id === userId)?.age_confirmed_at ?? null;
  if (world.is_age_restricted && !myAgeConfirmedAt) {
    return <AgeGate worldId={world.id} worldName={world.name} />;
  }

  // Ce layout n'est pas enveloppé par le `loading.tsx` du segment (seul
  // `page.tsx` l'est) : la sidebar reste donc montée et cliquable pendant
  // qu'on navigue entre deux vues du même monde.
  // Les onglets secondaires (wiki, carte, relations, catalogue) ne sont montés
  // que sous cette route : leurs namespaces sont retirés du tronc commun et
  // remontés ici, pour ne pas voyager sur les pages de salon ni ailleurs
  // (cf. lib/clientMessages.ts).
  return (
    <NextIntlClientProvider locale={locale} messages={withRouteMessages(messages, WORLD_ROUTE_NAMESPACES)}>
      <WorldMembershipProvider
        worldId={world.id}
        ownerId={world.owner_id}
        userId={userId ?? null}
        isMember={members.some((m) => m.user_id === userId)}
        roles={roles}
        myRoleIds={membership.roles.map((r) => r.id)}
      >
        <main className="composer-parent flex h-full flex-col focus-visible:outline-0">
          <WorldMembershipGuard worldId={world.id} selfId={userId ?? null} />
          <div className="flex min-h-0 w-full flex-1 flex-row">
            <WorldSidebar worldId={id} />
            {children}
          </div>
        </main>
      </WorldMembershipProvider>
    </NextIntlClientProvider>
  );
}
