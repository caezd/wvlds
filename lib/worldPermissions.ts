/**
 * Rôles et permissions d'un monde, côté client.
 *
 * La base fait foi (migration 176) : `has_world_permission(wid, uid, perm)`
 * dans les policies RLS, `world_rank` pour la hiérarchie. Ce module en tient
 * le miroir pour que l'interface cache ce que la base refuserait — et rien de
 * plus. `WORLD_PERMISSIONS` doit rester égal, à l'ordre près, au tableau de
 * `world_permission_keys()` ; `lib/__tests__/worldPermissions.test.ts` le
 * vérifie en lisant la migration.
 */

export const WORLD_PERMISSION_GROUPS = {
  general: ["administrator", "world.settings", "roles.manage", "members.manage"],
  chatrooms: ["messages.post", "chatrooms.create", "chatrooms.manage", "categories.manage"],
  content: ["wiki.edit", "wiki.comment", "lexicon.edit", "tags.manage", "map.edit", "catalog.edit", "timeline.manage"],
  personas: ["relations.manage", "personas.review", "npc.manage", "npc.play"],
  mentions: ["mentions.roles", "mentions.everyone"],
} as const;

export type WorldPermissionGroup = keyof typeof WORLD_PERMISSION_GROUPS;

export const WORLD_PERMISSIONS = Object.values(WORLD_PERMISSION_GROUPS).flat();

export type WorldPermission = (typeof WORLD_PERMISSION_GROUPS)[WorldPermissionGroup][number];

export function isWorldPermission(value: string): value is WorldPermission {
  return (WORLD_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Clé i18n d'une permission (`worlds.roles.permissions.<clé>`) : next-intl lit
 * le point comme un séparateur de chemin, `world.settings` devient donc
 * `world_settings`.
 */
export function permissionI18nKey(perm: string): string {
  return perm.replace(/\./g, "_");
}

/** Rang du propriétaire — au-dessus de tout rôle (`world_rank` en base). */
export const OWNER_RANK = 2147483647;

/** Ligne de `world_roles`, telle que lue en base. */
export type WorldRoleRow = {
  id: string;
  world_id: string;
  name: string;
  color: string;
  lucide_icon: string | null;
  position: number;
  permissions: string[];
  is_default: boolean;
  mentionable: boolean;
  hoist: boolean;
};

/**
 * Ce qu'un utilisateur est dans un monde : ses rôles, ses permissions
 * effectives et son rang. `null` pour un non-membre.
 */
export type WorldMembership = {
  userId: string;
  isOwner: boolean;
  roles: WorldRoleRow[];
  permissions: ReadonlySet<WorldPermission>;
  rank: number;
};

/** Tri canonique des rôles : du plus haut au plus bas. */
export function sortRolesByPosition<T extends { position: number; name: string }>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
}

/**
 * Compose l'appartenance depuis les lignes brutes.
 *
 * @param isMember  la ligne `world_members` existe — un propriétaire l'a
 *                  toujours (trigger), mais on ne s'y fie pas.
 */
export function buildMembership(args: {
  userId: string | null;
  ownerId: string;
  isMember: boolean;
  roles: readonly WorldRoleRow[];
  myRoleIds: readonly string[];
}): WorldMembership | null {
  const { userId, ownerId, isMember, roles, myRoleIds } = args;
  if (!userId) return null;
  const isOwner = userId === ownerId;
  if (!isOwner && !isMember) return null;

  const mine = new Set(myRoleIds);
  const myRoles = sortRolesByPosition(roles.filter((r) => mine.has(r.id)));
  const permissions = new Set<WorldPermission>();
  if (isOwner) permissions.add("administrator");
  for (const role of myRoles) {
    for (const p of role.permissions) if (isWorldPermission(p)) permissions.add(p);
  }
  const rank = isOwner ? OWNER_RANK : myRoles.length ? Math.max(...myRoles.map((r) => r.position)) : -1;
  return { userId, isOwner, roles: myRoles, permissions, rank };
}

/** `administrator` vaut pour toute permission, comme en base. */
export function hasWorldPermission(m: WorldMembership | null, perm: WorldPermission): boolean {
  if (!m) return false;
  return m.permissions.has("administrator") || m.permissions.has(perm);
}

/** Même règle, sur une liste sérialisée (props d'un composant client). */
export function permissionListHas(perms: readonly string[], perm: WorldPermission): boolean {
  return perms.includes("administrator") || perms.includes(perm);
}

/** Les permissions que l'on peut conférer à un rôle : celles que l'on a. */
export function grantablePermissions(m: WorldMembership | null): ReadonlySet<WorldPermission> {
  if (!m) return new Set();
  if (m.permissions.has("administrator")) return new Set(WORLD_PERMISSIONS);
  return m.permissions;
}

/** Modifier, supprimer ou attribuer un rôle : `roles.manage`/`members.manage` ET un rôle sous son rang. */
export function canManageRole(m: WorldMembership | null, role: { position: number }, perm: "roles.manage" | "members.manage" = "roles.manage"): boolean {
  return hasWorldPermission(m, perm) && role.position < (m?.rank ?? -1);
}

/** Toucher à un membre (rôles, retrait) : `members.manage` ET un membre sous son rang. */
export function canManageMember(m: WorldMembership | null, targetRank: number): boolean {
  return hasWorldPermission(m, "members.manage") && targetRank < (m?.rank ?? -1);
}

/** Rang d'un membre depuis ses rôles (sans ligne `world_members`, le propriétaire à part). */
export function rankOf(roles: readonly { position: number }[], isOwner: boolean): number {
  if (isOwner) return OWNER_RANK;
  return roles.length ? Math.max(...roles.map((r) => r.position)) : -1;
}

/** Le propriétaire ne quitte pas son monde : il le transfère ou le supprime. */
export function canLeaveWorld(m: WorldMembership | null): boolean {
  return !!m && !m.isOwner;
}

/** Modifier ou supprimer un salon : son créateur, ou `chatrooms.manage`. */
export function canEditChatroom(isCreator: boolean, m: WorldMembership | null): boolean {
  return isCreator || hasWorldPermission(m, "chatrooms.manage");
}

/** Le plus haut rôle « hoist » d'un membre — la section où il apparaît dans la liste. */
export function highestHoistedRole<T extends WorldRoleRow>(roles: readonly T[]): T | null {
  return sortRolesByPosition(roles.filter((r) => r.hoist))[0] ?? null;
}

/** Une vue de réglages a-t-elle quelque chose à montrer à ce membre ? */
export function canOpenWorldSettings(m: WorldMembership | null): boolean {
  return (
    hasWorldPermission(m, "world.settings") ||
    hasWorldPermission(m, "roles.manage") ||
    hasWorldPermission(m, "categories.manage") ||
    hasWorldPermission(m, "relations.manage") ||
    hasWorldPermission(m, "personas.review")
  );
}
