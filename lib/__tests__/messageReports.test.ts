import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/crypto", () => ({ decryptMessage: vi.fn(async (c: string) => c.replace(/^enc:/, "clair:")) }));

import { fetchOpenReports, reportMessage, resolveReport, REPORT_REASON_MAX } from "@/lib/messageReports";

describe("reportMessage", () => {
  it("n'envoie que le message et la raison (le reste est déduit en base)", async () => {
    const mock = createSupabaseMock({ results: [{ data: null }] });
    const res = await reportMessage(mock.client as never, 42, "  propos haineux  ");
    expect(res).toEqual({ ok: true });
    expect(mock.builders[0].table).toBe("message_reports");
    expect(mock.builders[0].builder.insert).toHaveBeenCalledWith({ message_id: 42, reason: "propos haineux" });
  });

  it("borne la raison", async () => {
    const mock = createSupabaseMock({ results: [{ data: null }] });
    await reportMessage(mock.client as never, 1, "x".repeat(REPORT_REASON_MAX + 20));
    const envoye = mock.builders[0].builder.insert.mock.calls[0][0] as { reason: string };
    expect(envoye.reason).toHaveLength(REPORT_REASON_MAX);
  });

  it("reconnaît un double signalement", async () => {
    const mock = createSupabaseMock({ results: [{ error: { code: "23505", message: "dup" } }] });
    expect(await reportMessage(mock.client as never, 1, "x")).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("fetchOpenReports", () => {
  it("déchiffre le message signalé avec la clé de son salon", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: [{ id: "r1", message_id: 5, chat_id: "c1", reason: "spam", created_at: "t", reporter: null, message_author: null, chat: null, message: { content: "enc:abc", persona: { name: "Aria" } } }] },
        { data: [{ chatroom_id: "c1", key_b64: "k" }] },
      ],
    });
    const [r] = await fetchOpenReports(mock.client as never, "w1");
    expect(mock.builders[0].builder.eq).toHaveBeenCalledWith("status", "open");
    expect(r).toMatchObject({ id: "r1", content: "clair:abc", persona_name: "Aria" });
    expect(r).not.toHaveProperty("message");
  });

  it("message disparu : contenu null", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [{ id: "r1", message_id: null, chat_id: "c1", reason: "x", created_at: "t", reporter: null, message_author: null, chat: null, message: null }] }],
    });
    const [r] = await fetchOpenReports(mock.client as never, "w1");
    expect(r.content).toBeNull();
  });
});

describe("resolveReport", () => {
  it("appelle resolve_message_report", async () => {
    const mock = createSupabaseMock();
    await resolveReport(mock.client as never, "r1", "delete");
    expect(mock.rpc).toHaveBeenCalledWith("resolve_message_report", { p_report_id: "r1", p_action: "delete" });
  });
});
