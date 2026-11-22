import { describe, expect, it, vi } from "vitest";
import {
  announcementErrorReason,
  compactFilters,
  fetchWorldWelcome,
  hasFilters,
  retractWorldAnnouncement,
  saveWorldWelcome,
  countAnnouncementRecipients,
  fetchAnnouncementReadCounts,
  fetchWorldAnnouncements,
  renderAnnouncement,
  sendAnnouncementTest,
  sendWorldAnnouncement,
} from "@/lib/worldAnnouncements";

describe("renderAnnouncement", () => {
  it("remplace chaque occurrence des deux variables, comme la base", () => {
    expect(renderAnnouncement("Salut {username}, bienvenue dans {world} ! {username}", { username: "Lys", world: "Ygg" }))
      .toBe("Salut Lys, bienvenue dans Ygg ! Lys");
  });

  it("laisse intacte une accolade qui n'est pas une variable", () => {
    expect(renderAnnouncement("{login} {World}", { username: "a", world: "b" })).toBe("{login} {World}");
  });
});

describe("announcementErrorReason", () => {
  it("reconnaît les refus nommés de la RPC", () => {
    expect(announcementErrorReason({ message: "announcement_rate_limit" })).toBe("rate_limit");
    expect(announcementErrorReason({ message: "announcement_test_rate_limit" })).toBe("test_rate_limit");
    expect(announcementErrorReason({ message: "announcement_dms_disabled" })).toBe("dms_disabled");
    expect(announcementErrorReason({ message: "announcement_invalid" })).toBe("invalid");
    expect(announcementErrorReason({ message: "Permission refusée.", code: "42501" })).toBe("forbidden");
    expect(announcementErrorReason({ message: "boom" })).toBe("error");
  });
});

describe("sendWorldAnnouncement", () => {
  it("n'envoie pas de titre pour un message privé, et rogne le texte", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "a1", recipients: 3 }, error: null });
    const res = await sendWorldAnnouncement({ rpc } as never, {
      worldId: "w1", kind: "message", title: "ignoré", body: "  Coucou  ", roleIds: ["r1"],
    });
    expect(res).toEqual({ ok: true, recipients: 3 });
    expect(rpc).toHaveBeenCalledWith("send_world_announcement", {
      p_world_id: "w1", p_kind: "message", p_title: null, p_body: "Coucou", p_role_ids: ["r1"], p_filters: {},
    });
  });

  it("transmet le titre d'une notification", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "a1", recipients: 0 }, error: null });
    await sendWorldAnnouncement({ rpc } as never, { worldId: "w1", kind: "notification", title: " Rentrée ", body: "x", roleIds: [] });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_kind: "notification", p_title: "Rentrée", p_role_ids: [] });
  });

  it("nomme la raison d'un refus", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "announcement_rate_limit", code: "P0001" } });
    expect(await sendWorldAnnouncement({ rpc } as never, { worldId: "w1", kind: "notification", title: "t", body: "b", roleIds: [] }))
      .toEqual({ ok: false, reason: "rate_limit" });
  });
});

describe("countAnnouncementRecipients", () => {
  it("renvoie le nombre, ou null si la base refuse", async () => {
    const ok = vi.fn().mockResolvedValue({ data: 7, error: null });
    expect(await countAnnouncementRecipients({ rpc: ok } as never, "w1", "message", [])).toBe(7);
    expect(ok).toHaveBeenCalledWith("count_world_announcement_recipients", { p_world_id: "w1", p_kind: "message", p_role_ids: [], p_filters: {} });

    const ko = vi.fn().mockResolvedValue({ data: null, error: { message: "Permission refusée." } });
    expect(await countAnnouncementRecipients({ rpc: ko } as never, "w1", "message", [])).toBeNull();
  });
});

describe("fetchWorldAnnouncements", () => {
  it("lit l'historique du monde, du plus récent au plus ancien", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "a1" }], error: null }),
    };
    const from = vi.fn().mockReturnValue(chain);
    expect(await fetchWorldAnnouncements({ from } as never, "w1")).toEqual([{ id: "a1" }]);
    expect(from).toHaveBeenCalledWith("world_announcements");
    expect(chain.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});

describe("sendAnnouncementTest", () => {
  it("appelle la RPC d'essai, sans titre pour un message privé", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await sendAnnouncementTest({ rpc } as never, { worldId: "w1", kind: "message", title: "ignoré", body: " Coucou " }))
      .toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("send_world_announcement_test", {
      p_world_id: "w1", p_kind: "message", p_title: null, p_body: "Coucou",
    });
  });

  it("nomme le plafond des essais", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "announcement_test_rate_limit", code: "P0001" } });
    expect(await sendAnnouncementTest({ rpc } as never, { worldId: "w1", kind: "notification", title: "t", body: "b" }))
      .toEqual({ ok: false, reason: "test_rate_limit" });
  });
});

describe("fetchAnnouncementReadCounts", () => {
  it("rend les lectures par annonce", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ announcement_id: "a1", read_count: 4 }], error: null });
    const reads = await fetchAnnouncementReadCounts({ rpc } as never, "w1", ["a1", "a2"]);
    expect(rpc).toHaveBeenCalledWith("world_announcement_read_counts", { p_world_id: "w1", p_ids: ["a1", "a2"] });
    expect(reads.get("a1")).toBe(4);
    expect(reads.has("a2")).toBe(false);
  });

  it("n'appelle pas la base sans annonce, et rend une carte vide en cas d'échec", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await fetchAnnouncementReadCounts({ rpc } as never, "w1", [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect((await fetchAnnouncementReadCounts({ rpc } as never, "w1", ["a1"])).size).toBe(0);
  });
});

describe("filtres de destinataires", () => {
  it("compactFilters retire les filtres vides et trie les rôles exclus", () => {
    expect(compactFilters({})).toEqual({});
    expect(compactFilters({ exclude_role_ids: [], joined_within_days: undefined, inactive_days: 0 })).toEqual({});
    expect(compactFilters({ exclude_role_ids: ["b", "a"], inactive_days: 30 })).toEqual({ exclude_role_ids: ["a", "b"], inactive_days: 30 });
  });

  it("hasFilters", () => {
    expect(hasFilters(null)).toBe(false);
    expect(hasFilters({ exclude_role_ids: [] })).toBe(false);
    expect(hasFilters({ joined_within_days: 7 })).toBe(true);
  });

  it("l'envoi et le compte transmettent les filtres compactés", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "a1", recipients: 2 }, error: null });
    await sendWorldAnnouncement({ rpc } as never, {
      worldId: "w1", kind: "notification", title: "t", body: "b", roleIds: [], filters: { exclude_role_ids: [], inactive_days: 90 },
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_filters: { inactive_days: 90 } });

    const count = vi.fn().mockResolvedValue({ data: 3, error: null });
    await countAnnouncementRecipients({ rpc: count } as never, "w1", "message", [], { exclude_role_ids: ["r1"] });
    expect(count.mock.calls[0][1]).toMatchObject({ p_filters: { exclude_role_ids: ["r1"] } });
  });
});

describe("retractWorldAnnouncement", () => {
  it("rend le nombre de notifications retirées, ou la raison du refus", async () => {
    const ok = vi.fn().mockResolvedValue({ data: 11, error: null });
    expect(await retractWorldAnnouncement({ rpc: ok } as never, "a1")).toEqual({ ok: true, removed: 11 });
    expect(ok).toHaveBeenCalledWith("retract_world_announcement", { p_announcement_id: "a1" });

    vi.spyOn(console, "error").mockImplementation(() => {});
    const ko = vi.fn().mockResolvedValue({ data: null, error: { message: "announcement_invalid", code: "22023" } });
    expect(await retractWorldAnnouncement({ rpc: ko } as never, "a1")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("message de bienvenue", () => {
  it("fetchWorldWelcome lit le modèle du monde, ou null", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { enabled: true, kind: "message" }, error: null }),
    };
    const from = vi.fn().mockReturnValue(chain);
    expect(await fetchWorldWelcome({ from } as never, "w1")).toEqual({ enabled: true, kind: "message" });
    expect(from).toHaveBeenCalledWith("world_welcome_messages");
    expect(chain.eq).toHaveBeenCalledWith("world_id", "w1");

    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await fetchWorldWelcome({ from } as never, "w1")).toBeNull();
  });

  it("saveWorldWelcome n'envoie pas de titre pour un message privé", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await saveWorldWelcome({ rpc } as never, { worldId: "w1", enabled: true, kind: "message", title: "x", body: " Salut " }))
      .toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("save_world_welcome", {
      p_world_id: "w1", p_enabled: true, p_kind: "message", p_title: null, p_body: "Salut",
    });
  });
});
