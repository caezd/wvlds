import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import {
  OPEN_POST_ACCESS,
  inviteesFromRows,
  isChatroomVisibility,
  parsePostAccess,
  saveChatroomInvitees,
  visibilityHasInvitees,
} from "@/lib/chatroomAccess";

describe("chatroomAccess", () => {
  it("visibilités reconnues", () => {
    expect(isChatroomVisibility("open")).toBe(true);
    expect(isChatroomVisibility("private")).toBe(true);
    expect(isChatroomVisibility("secret")).toBe(false);
    expect(isChatroomVisibility(null)).toBe(false);
    expect(visibilityHasInvitees("open")).toBe(false);
    expect(visibilityHasInvitees("public")).toBe(true);
  });

  it("lignes de participants → invités", () => {
    expect(inviteesFromRows([
      { persona_id: "p1", group_id: null },
      { persona_id: null, group_id: "g1" },
      { persona_id: null, group_id: null },
    ])).toEqual([{ kind: "persona", id: "p1" }, { kind: "group", id: "g1" }]);
  });

  it("accès en écriture : ouvert par défaut, sinon les personas invités", () => {
    expect(parsePostAccess(null)).toBe(OPEN_POST_ACCESS);
    expect(parsePostAccess({ open: true, persona_ids: [] })).toBe(OPEN_POST_ACCESS);
    expect(parsePostAccess({ open: false, persona_ids: ["p1", 3, "p2"] })).toEqual({ open: false, personaIds: ["p1", "p2"] });
    expect(parsePostAccess({ open: false })).toEqual({ open: false, personaIds: [] });
  });

  describe("saveChatroomInvitees", () => {
    it("ajoute les nouveaux et retire les absents, par type", async () => {
      const mock = createSupabaseMock({ user: { id: "u1" }, results: [{}, {}, {}] });
      const ok = await saveChatroomInvitees(
        mock.client as never,
        "c1",
        [{ kind: "persona", id: "p-old" }, { kind: "group", id: "g-old" }, { kind: "persona", id: "p-keep" }],
        [{ kind: "persona", id: "p-keep" }, { kind: "group", id: "g-new" }],
      );
      expect(ok).toBe(true);
      const [add, delPersonas, delGroups] = mock.buildersFor("chatroom_participants");
      expect(add.insert).toHaveBeenCalledWith([{ chatroom_id: "c1", persona_id: null, group_id: "g-new" }]);
      expect(delPersonas.in).toHaveBeenCalledWith("persona_id", ["p-old"]);
      expect(delGroups.in).toHaveBeenCalledWith("group_id", ["g-old"]);
      expect(delPersonas.eq).toHaveBeenCalledWith("chatroom_id", "c1");
    });

    it("rien à faire : aucune requête", async () => {
      const mock = createSupabaseMock({ user: { id: "u1" } });
      const same = [{ kind: "persona" as const, id: "p1" }];
      expect(await saveChatroomInvitees(mock.client as never, "c1", same, same)).toBe(true);
      expect(mock.buildersFor("chatroom_participants")).toHaveLength(0);
    });

    it("un refus rend false", async () => {
      const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] });
      const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await saveChatroomInvitees(mock.client as never, "c1", [], [{ kind: "persona", id: "p1" }])).toBe(false);
      erreur.mockRestore();
    });
  });
});
