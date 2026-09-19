"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  buildMembership,
  hasWorldPermission,
  type WorldMembership,
  type WorldPermission,
  type WorldRoleRow,
} from "@/lib/worldPermissions";

/**
 * Les rôles du monde et l'appartenance de l'utilisateur courant, pour tout ce
 * qui se rend sous un monde : la liste des membres (puces, menu de gestion),
 * les réglages (onglet Rôles), le composer et le rendu des mentions.
 *
 * Résolu côté serveur (`getWorldMembership`) et fourni ici en props brutes ;
 * `refresh()` relance le rendu serveur après une modification de rôle.
 */
type Value = {
  worldId: string;
  ownerId: string;
  roles: WorldRoleRow[];
  membership: WorldMembership | null;
  can: (perm: WorldPermission) => boolean;
  refresh: () => void;
};

const WorldMembershipContext = React.createContext<Value | null>(null);

export function WorldMembershipProvider({
  worldId,
  ownerId,
  userId,
  isMember,
  roles,
  myRoleIds,
  children,
}: {
  worldId: string;
  ownerId: string;
  userId: string | null;
  isMember: boolean;
  roles: WorldRoleRow[];
  myRoleIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const value = React.useMemo<Value>(() => {
    const membership = buildMembership({ userId, ownerId, isMember, roles, myRoleIds });
    return {
      worldId,
      ownerId,
      roles,
      membership,
      can: (perm) => hasWorldPermission(membership, perm),
      refresh: () => router.refresh(),
    };
  }, [worldId, ownerId, userId, isMember, roles, myRoleIds, router]);

  return <WorldMembershipContext.Provider value={value}>{children}</WorldMembershipContext.Provider>;
}

/** Hors d'un monde (messages privés, pages globales) : aucun rôle, aucune permission. */
const NONE: Value = {
  worldId: "",
  ownerId: "",
  roles: [],
  membership: null,
  can: () => false,
  refresh: () => {},
};

export function useWorldMembership(): Value {
  return React.useContext(WorldMembershipContext) ?? NONE;
}
