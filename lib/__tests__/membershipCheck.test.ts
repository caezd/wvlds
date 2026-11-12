import { describe, it, expect } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { isStillWorldMember } from "@/lib/membershipCheck";

describe("isStillWorldMember", () => {
  it("membre : vrai, en une requête", async () => {
    const mock = createSupabaseMock({ results: [{ data: { user_id: "u1" } }] });
    expect(await isStillWorldMember(mock.client as never, "w1", "u1")).toBe(true);
    expect(mock.from).toHaveBeenCalledTimes(1);
  });

  it("plus membre : faux (monde illisible ou propriétaire autre)", async () => {
    const illisible = createSupabaseMock({ results: [{ data: null }, { data: null }] });
    expect(await isStillWorldMember(illisible.client as never, "w1", "u1")).toBe(false);
    const autre = createSupabaseMock({ results: [{ data: null }, { data: { owner_id: "u9" } }] });
    expect(await isStillWorldMember(autre.client as never, "w1", "u1")).toBe(false);
  });

  it("propriétaire sans ligne de membre : vrai", async () => {
    const mock = createSupabaseMock({ results: [{ data: null }, { data: { owner_id: "u1" } }] });
    expect(await isStillWorldMember(mock.client as never, "w1", "u1")).toBe(true);
  });

  it("erreur : incertain (null), on ne conclut rien", async () => {
    const mock = createSupabaseMock({ results: [{ error: { message: "réseau" } }] });
    expect(await isStillWorldMember(mock.client as never, "w1", "u1")).toBeNull();
  });
});
