import { describe, expect, it, vi } from "vitest";
import {
  extrasToRpc,
  fetchHomeAnnouncements,
  isAnnouncementLabel,
  scheduleWorldAnnouncement,
  sendWorldAnnouncement,
  updateWorldAnnouncement,
} from "@/lib/worldAnnouncements";

// Migration 235 : accueil, épingle, étiquette, image, modification.

describe("extrasToRpc", () => {
  it("ne garde que les clés présentes, au format de la base", () => {
    expect(extrasToRpc(undefined)).toEqual({});
    expect(extrasToRpc({ showOnHome: true, label: "event" })).toEqual({ show_on_home: true, label: "event" });
    expect(extrasToRpc({ pinned: false, imageUrl: null, label: null })).toEqual({ pinned: false, image_url: null, label: null });
  });

  it("reconnaît les étiquettes de la base, et elles seules", () => {
    expect(isAnnouncementLabel("maintenance")).toBe(true);
    expect(isAnnouncementLabel("pirate")).toBe(false);
    expect(isAnnouncementLabel(null)).toBe(false);
  });
});

describe("envoi avec options", () => {
  it("envoie les options dans le même appel que l'annonce", async () => {
    const rpc = vi.fn(async () => ({ data: { id: "a1", recipients: 3 }, error: null }));
    await sendWorldAnnouncement({ rpc } as never, {
      worldId: "w1", kind: "notification", title: "T", body: "B", roleIds: [],
      extras: { showOnHome: true, pinned: true, label: "rules" },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("send_world_announcement", expect.objectContaining({
      p_extras: { show_on_home: true, pinned: true, label: "rules" },
    }));
  });

  it("programme avec les options", async () => {
    const rpc = vi.fn(async () => ({ data: "s1", error: null }));
    await scheduleWorldAnnouncement({ rpc } as never, {
      worldId: "w1", kind: "banner", title: "T", body: "B", roleIds: [], scheduledFor: new Date("2026-12-01T10:00:00Z"),
      extras: { showOnHome: true },
    });
    expect(rpc).toHaveBeenCalledWith("schedule_world_announcement", expect.objectContaining({ p_extras: { show_on_home: true } }));
  });
});

describe("updateWorldAnnouncement", () => {
  it("n'envoie que ce qui change : contenu absent = inchangé", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    expect(await updateWorldAnnouncement({ rpc } as never, "a1", { extras: { pinned: false } })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("update_world_announcement", {
      p_id: "a1", p_title: null, p_body: null, p_extras: { pinned: false },
    });
  });

  it("rogne le titre et le texte modifiés ; sans option, p_extras est nul", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await updateWorldAnnouncement({ rpc } as never, "a1", { title: "  Nouveau  ", body: " Texte " });
    expect(rpc).toHaveBeenCalledWith("update_world_announcement", {
      p_id: "a1", p_title: "Nouveau", p_body: "Texte", p_extras: null,
    });
  });

  it("traduit un refus de la base", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "Permission refusée.", code: "42501" } }));
    expect(await updateWorldAnnouncement({ rpc } as never, "a1", { title: "X" })).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("fetchHomeAnnouncements", () => {
  it("borne la limite et écarte une étiquette inconnue", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ id: "a1", label: "event" }, { id: "a2", label: "pirate" }],
      error: null,
    }));
    const list = await fetchHomeAnnouncements({ rpc } as never, "w1", 99);
    expect(rpc).toHaveBeenCalledWith("get_world_home_announcements", { p_world_id: "w1", p_limit: 20 });
    expect(list.map((a) => a.label)).toEqual(["event", null]);
  });

  it("une erreur rend une liste vide", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    expect(await fetchHomeAnnouncements({ rpc } as never, "w1")).toEqual([]);
  });
});
