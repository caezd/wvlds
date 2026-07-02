import { describe, it, expect } from "vitest";
import {
  isWorldMember,
  canEditContent,
  canManageWorld,
  isWorldOwnerRole,
  canMemberPost,
  canLeaveWorld,
  canEditChatroom,
  canEditSystemTabs,
} from "@/lib/worldPermissions";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES_ALL = ["owner", "admin", "editor", "player", "viewer"] as const;
const ROLES_EDITOR_PLUS = ["owner", "admin", "editor"] as const;
const ROLES_ADMIN_PLUS = ["owner", "admin"] as const;
const ROLES_BELOW_EDITOR = ["player", "viewer"] as const;
const ROLES_BELOW_ADMIN = ["editor", "player", "viewer"] as const;

// ── isWorldMember ─────────────────────────────────────────────────────────────

describe("isWorldMember", () => {
  it.each(ROLES_ALL)("rôle %s → membre", (role) => {
    expect(isWorldMember(role, false)).toBe(true);
  });

  it("owner direct (isWorldOwner=true) sans entrée world_members → membre", () => {
    expect(isWorldMember(null, true)).toBe(true);
  });

  it("null sans isWorldOwner → non membre", () => {
    expect(isWorldMember(null, false)).toBe(false);
  });
});

// ── canEditContent (is_world_editor) ─────────────────────────────────────────

describe("canEditContent — is_world_editor", () => {
  it.each(ROLES_EDITOR_PLUS)("rôle %s → peut éditer le contenu", (role) => {
    expect(canEditContent(role, false)).toBe(true);
  });

  it.each(ROLES_BELOW_EDITOR)("rôle %s → ne peut pas éditer le contenu", (role) => {
    expect(canEditContent(role, false)).toBe(false);
  });

  it("owner direct sans rôle → peut éditer le contenu", () => {
    expect(canEditContent(null, true)).toBe(true);
  });

  it("viewer avec isWorldOwner=true → peut éditer (owner prime sur le rôle)", () => {
    expect(canEditContent("viewer", true)).toBe(true);
  });
});

// ── canManageWorld (is_world_admin) ───────────────────────────────────────────

describe("canManageWorld — is_world_admin", () => {
  it.each(ROLES_ADMIN_PLUS)("rôle %s → peut gérer le monde", (role) => {
    expect(canManageWorld(role, false)).toBe(true);
  });

  it.each(ROLES_BELOW_ADMIN)("rôle %s → ne peut pas gérer le monde", (role) => {
    expect(canManageWorld(role, false)).toBe(false);
  });

  it("owner direct sans rôle → peut gérer le monde", () => {
    expect(canManageWorld(null, true)).toBe(true);
  });

  it("editor avec isWorldOwner=true → peut gérer (owner prime)", () => {
    expect(canManageWorld("editor", true)).toBe(true);
  });
});

// ── isWorldOwnerRole ──────────────────────────────────────────────────────────

describe("isWorldOwnerRole", () => {
  it("rôle owner → true", () => {
    expect(isWorldOwnerRole("owner")).toBe(true);
  });

  it.each(["admin", "editor", "player", "viewer"] as const)(
    "rôle %s → false",
    (role) => {
      expect(isWorldOwnerRole(role)).toBe(false);
    },
  );

  it("null → false", () => {
    expect(isWorldOwnerRole(null)).toBe(false);
  });
});

// ── canMemberPost ─────────────────────────────────────────────────────────────

describe("canMemberPost", () => {
  const CAN_POST = ["owner", "admin", "editor", "player"] as const;

  it.each(CAN_POST)("rôle %s → peut poster", (role) => {
    expect(canMemberPost(role, false)).toBe(true);
  });

  it("rôle viewer → ne peut pas poster", () => {
    expect(canMemberPost("viewer", false)).toBe(false);
  });

  it("viewer avec isWorldOwner=true → peut poster (owner prime)", () => {
    expect(canMemberPost("viewer", true)).toBe(true);
  });

  it("owner direct sans rôle → peut poster", () => {
    expect(canMemberPost(null, true)).toBe(true);
  });

  it("null sans isWorldOwner → ne peut pas poster", () => {
    expect(canMemberPost(null, false)).toBe(false);
  });
});

// ── canLeaveWorld ─────────────────────────────────────────────────────────────

describe("canLeaveWorld", () => {
  const CAN_LEAVE = ["admin", "editor", "player", "viewer"] as const;

  it.each(CAN_LEAVE)("rôle %s → peut quitter", (role) => {
    expect(canLeaveWorld(role, false)).toBe(true);
  });

  it("rôle owner (world_members) → ne peut pas quitter", () => {
    expect(canLeaveWorld("owner", false)).toBe(false);
  });

  it("owner direct (isWorldOwner=true) → ne peut pas quitter", () => {
    expect(canLeaveWorld("admin", true)).toBe(false);
  });

  it("owner direct sans rôle → ne peut pas quitter", () => {
    expect(canLeaveWorld(null, true)).toBe(false);
  });
});

// ── canEditChatroom ───────────────────────────────────────────────────────────

describe("canEditChatroom", () => {
  describe("créateur de la chatroom", () => {
    it.each(ROLES_ALL)("créateur avec rôle %s → peut éditer", (role) => {
      expect(canEditChatroom(true, role, false)).toBe(true);
    });

    it("créateur sans rôle (owner direct) → peut éditer", () => {
      expect(canEditChatroom(true, null, true)).toBe(true);
    });
  });

  describe("non-créateur", () => {
    it.each(ROLES_EDITOR_PLUS)(
      "non-créateur avec rôle %s → peut éditer (editor+)",
      (role) => {
        expect(canEditChatroom(false, role, false)).toBe(true);
      },
    );

    it.each(ROLES_BELOW_EDITOR)(
      "non-créateur avec rôle %s → ne peut pas éditer",
      (role) => {
        expect(canEditChatroom(false, role, false)).toBe(false);
      },
    );

    it("non-créateur owner direct → peut éditer", () => {
      expect(canEditChatroom(false, null, true)).toBe(true);
    });
  });
});

// ── canEditSystemTabs ─────────────────────────────────────────────────────────

describe("canEditSystemTabs", () => {
  it("owner direct → peut modifier les tabs système", () => {
    expect(canEditSystemTabs(true)).toBe(true);
  });

  it("non owner direct → ne peut pas modifier les tabs système", () => {
    expect(canEditSystemTabs(false)).toBe(false);
  });
});

// ── Matrice complète par rôle ─────────────────────────────────────────────────
// Vérifie que chaque rôle a exactement les permissions attendues.

describe("matrice complète des permissions par rôle", () => {
  type Matrix = {
    role: string;
    isOwner: boolean;
    member: boolean;
    post: boolean;
    editContent: boolean;
    manageWorld: boolean;
    leave: boolean;
  };

  const matrix: Matrix[] = [
    { role: "owner",  isOwner: false, member: true,  post: true,  editContent: true,  manageWorld: true,  leave: false },
    { role: "admin",  isOwner: false, member: true,  post: true,  editContent: true,  manageWorld: true,  leave: true  },
    { role: "editor", isOwner: false, member: true,  post: true,  editContent: true,  manageWorld: false, leave: true  },
    { role: "player", isOwner: false, member: true,  post: true,  editContent: false, manageWorld: false, leave: true  },
    { role: "viewer", isOwner: false, member: true,  post: false, editContent: false, manageWorld: false, leave: true  },
    // owner direct sans entrée world_members
    { role: "null",   isOwner: true,  member: true,  post: true,  editContent: true,  manageWorld: true,  leave: false },
  ];

  it.each(matrix)(
    "rôle=$role isOwner=$isOwner",
    ({ role, isOwner, member, post, editContent, manageWorld, leave }) => {
      const r = role === "null" ? null : role;
      expect(isWorldMember(r, isOwner)).toBe(member);
      expect(canMemberPost(r, isOwner)).toBe(post);
      expect(canEditContent(r, isOwner)).toBe(editContent);
      expect(canManageWorld(r, isOwner)).toBe(manageWorld);
      expect(canLeaveWorld(r, isOwner)).toBe(leave);
    },
  );
});
