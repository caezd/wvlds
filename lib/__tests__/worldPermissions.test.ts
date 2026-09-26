import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  OWNER_RANK,
  WORLD_PERMISSIONS,
  WORLD_PERMISSION_GROUPS,
  buildMembership,
  canEditChatroom,
  canLeaveWorld,
  canManageMember,
  canManageRole,
  canOpenWorldSettings,
  grantablePermissions,
  hasWorldPermission,
  highestHoistedRole,
  permissionListHas,
  rankOf,
  sortRolesByPosition,
  type WorldRoleRow,
} from "@/lib/worldPermissions";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function role(over: Partial<WorldRoleRow> & { id: string }): WorldRoleRow {
  return {
    world_id: "w1",
    name: over.id,
    color: "#000000",
    lucide_icon: null,
    position: 0,
    permissions: [],
    is_default: false,
    mentionable: false,
    hoist: false,
    ...over,
  };
}

const ADMIN = role({ id: "admin", position: 30, permissions: ["administrator"], hoist: true });
const EDITOR = role({ id: "editor", position: 20, permissions: ["wiki.edit", "map.edit", "messages.post"], hoist: true });
const PLAYER = role({ id: "player", position: 10, permissions: ["messages.post", "chatrooms.create"], is_default: true });
const VIEWER = role({ id: "viewer", position: 0 });
const ROLES = [VIEWER, PLAYER, ADMIN, EDITOR];

function member(myRoleIds: string[], userId = "u1") {
  return buildMembership({ userId, ownerId: "owner", isMember: true, roles: ROLES, myRoleIds });
}

// ── Miroir de la migration ────────────────────────────────────────────────────

describe("WORLD_PERMISSIONS — miroir de `world_permission_keys()`", () => {
  it("égale, à l'ordre près, la dernière définition de `world_permission_keys()`", () => {
    // La fonction est recréée à chaque permission ajoutée (176, 181…) : la
    // dernière migration qui la définit fait foi.
    const dir = join(process.cwd(), "migrations");
    const file = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .reverse()
      .find((f) => readFileSync(join(dir, f), "utf-8").includes("FUNCTION public.world_permission_keys()"));
    expect(file).toBeDefined();
    const sql = readFileSync(join(dir, file!), "utf-8");
    const fn = sql.slice(sql.indexOf("FUNCTION public.world_permission_keys()"));
    const body = fn.slice(fn.indexOf("ARRAY["), fn.indexOf("]::text[]"));
    const inSql = [...body.matchAll(/'([a-z.]+)'/g)].map((m) => m[1]);
    expect([...WORLD_PERMISSIONS].sort()).toEqual([...inSql].sort());
  });

  it("chaque groupe ne cite une permission qu'une fois", () => {
    const all = Object.values(WORLD_PERMISSION_GROUPS).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

// ── buildMembership ───────────────────────────────────────────────────────────

describe("buildMembership", () => {
  it("rend null sans utilisateur, ou pour un non-membre qui n'est pas propriétaire", () => {
    expect(buildMembership({ userId: null, ownerId: "o", isMember: true, roles: ROLES, myRoleIds: [] })).toBeNull();
    expect(buildMembership({ userId: "u1", ownerId: "o", isMember: false, roles: ROLES, myRoleIds: [] })).toBeNull();
  });

  it("le propriétaire est administrateur, au rang maximal, même sans ligne de membre", () => {
    const m = buildMembership({ userId: "owner", ownerId: "owner", isMember: false, roles: ROLES, myRoleIds: [] });
    expect(m?.isOwner).toBe(true);
    expect(m?.rank).toBe(OWNER_RANK);
    expect(hasWorldPermission(m, "wiki.edit")).toBe(true);
  });

  it("un membre sans rôle a le rang -1 et aucune permission", () => {
    const m = member([]);
    expect(m?.rank).toBe(-1);
    expect(m?.permissions.size).toBe(0);
    expect(hasWorldPermission(m, "messages.post")).toBe(false);
  });

  it("cumule les permissions de plusieurs rôles et prend le rang du plus haut", () => {
    const m = member(["player", "editor"]);
    expect(m?.rank).toBe(20);
    expect(m?.roles.map((r) => r.id)).toEqual(["editor", "player"]);
    expect(hasWorldPermission(m, "chatrooms.create")).toBe(true);
    expect(hasWorldPermission(m, "wiki.edit")).toBe(true);
    expect(hasWorldPermission(m, "catalog.edit")).toBe(false);
  });

  it("ignore un identifiant de rôle inconnu et une permission inconnue", () => {
    const weird = role({ id: "weird", position: 5, permissions: ["not.a.permission", "tags.manage"] });
    const m = buildMembership({ userId: "u1", ownerId: "o", isMember: true, roles: [weird], myRoleIds: ["weird", "ghost"] });
    expect([...(m?.permissions ?? [])]).toEqual(["tags.manage"]);
  });
});

// ── hasWorldPermission / permissionListHas ────────────────────────────────────

describe("hasWorldPermission", () => {
  it("`administrator` vaut pour toute permission", () => {
    const m = member(["admin"]);
    for (const p of WORLD_PERMISSIONS) expect(hasWorldPermission(m, p)).toBe(true);
  });

  it("rend false pour null", () => {
    expect(hasWorldPermission(null, "messages.post")).toBe(false);
  });

  it("permissionListHas applique la même règle à une liste sérialisée", () => {
    expect(permissionListHas(["administrator"], "map.edit")).toBe(true);
    expect(permissionListHas(["map.edit"], "map.edit")).toBe(true);
    expect(permissionListHas(["map.edit"], "wiki.edit")).toBe(false);
  });
});

// ── Hiérarchie ────────────────────────────────────────────────────────────────

describe("canManageRole / canManageMember — la hiérarchie", () => {
  const admin = member(["admin"]);
  const editor = member(["editor"]);

  it("il faut la permission ET un rôle strictement sous son rang", () => {
    expect(canManageRole(admin, EDITOR)).toBe(true);
    expect(canManageRole(admin, ADMIN)).toBe(false); // au niveau : non
    expect(canManageRole(editor, PLAYER)).toBe(false); // pas de roles.manage
  });

  it("le propriétaire gère tout", () => {
    const owner = buildMembership({ userId: "owner", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: [] });
    expect(canManageRole(owner, ADMIN)).toBe(true);
    expect(canManageMember(owner, 30)).toBe(true);
  });

  it("on ne touche qu'aux membres sous son rang", () => {
    expect(canManageMember(admin, 20)).toBe(true);
    expect(canManageMember(admin, 30)).toBe(false);
    expect(canManageMember(admin, -1)).toBe(true);
    expect(canManageMember(null, -1)).toBe(false);
  });

  it("rankOf : propriétaire au sommet, -1 sans rôle, sinon la plus haute position", () => {
    expect(rankOf([], true)).toBe(OWNER_RANK);
    expect(rankOf([], false)).toBe(-1);
    expect(rankOf([PLAYER, EDITOR], false)).toBe(20);
  });
});

describe("grantablePermissions — on ne confère que ce qu'on a", () => {
  it("un administrateur (ou le propriétaire) peut tout conférer", () => {
    expect(grantablePermissions(member(["admin"])).size).toBe(WORLD_PERMISSIONS.length);
  });

  it("un éditeur ne confère que ses propres permissions", () => {
    expect([...grantablePermissions(member(["editor"]))].sort()).toEqual(["map.edit", "messages.post", "wiki.edit"]);
  });

  it("rien pour null", () => {
    expect(grantablePermissions(null).size).toBe(0);
  });
});

// ── Règles dérivées ───────────────────────────────────────────────────────────

describe("règles dérivées", () => {
  it("canLeaveWorld : tout membre sauf le propriétaire", () => {
    expect(canLeaveWorld(member([]))).toBe(true);
    expect(canLeaveWorld(buildMembership({ userId: "owner", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: [] }))).toBe(false);
    expect(canLeaveWorld(null)).toBe(false);
  });

  it("canEditChatroom : le créateur, ou `chatrooms.manage`", () => {
    expect(canEditChatroom(true, null)).toBe(true);
    expect(canEditChatroom(false, member(["editor"]))).toBe(false);
    expect(canEditChatroom(false, member(["admin"]))).toBe(true);
  });

  it("canOpenWorldSettings : dès qu'un onglet a quelque chose à montrer", () => {
    expect(canOpenWorldSettings(member(["player"]))).toBe(false);
    const rolesOnly = role({ id: "r", position: 5, permissions: ["roles.manage"] });
    const m = buildMembership({ userId: "u1", ownerId: "o", isMember: true, roles: [rolesOnly], myRoleIds: ["r"] });
    expect(canOpenWorldSettings(m)).toBe(true);
  });
});

// ── Tri et sections ───────────────────────────────────────────────────────────

describe("sortRolesByPosition / highestHoistedRole", () => {
  it("trie du plus haut au plus bas, puis par nom", () => {
    const a = role({ id: "a", name: "Zeta", position: 10 });
    const b = role({ id: "b", name: "Alpha", position: 10 });
    expect(sortRolesByPosition([VIEWER, a, ADMIN, b]).map((r) => r.id)).toEqual(["admin", "b", "a", "viewer"]);
  });

  it("le plus haut rôle « hoist » donne la section ; aucun → null", () => {
    expect(highestHoistedRole([PLAYER, EDITOR, ADMIN])?.id).toBe("admin");
    expect(highestHoistedRole([PLAYER, VIEWER])).toBeNull();
  });
});
