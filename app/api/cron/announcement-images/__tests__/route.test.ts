import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { rpcMock, removeMock, fromMock } = vi.hoisted(() => {
  const removeMock = vi.fn(async (_paths: string[]) => ({ data: [] as unknown, error: null as unknown }));
  return {
    rpcMock: vi.fn(async (_fn: string) => ({ data: [] as unknown, error: null as unknown })),
    removeMock,
    fromMock: vi.fn((_bucket: string) => ({ remove: removeMock })),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock, storage: { from: fromMock } }),
}));

import { GET } from "../route";

const SECRET = "cron-secret-xyz";
function req(auth?: string) {
  return new NextRequest("http://localhost:3000/api/cron/announcement-images", {
    headers: auth ? { authorization: auth } : {},
  });
}
const nom = (i: number) => `user-00000000-0000-0000-0000-000000000001/announcements/${i}.webp`;

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
  removeMock.mockReset();
  removeMock.mockResolvedValue({ data: [], error: null });
  fromMock.mockClear();
});

describe("GET /api/cron/announcement-images", () => {
  it("401 sans le bon secret, sans rien lister", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer mauvais"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer nimporte"))).status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rien d'abandonné : rien d'effacé", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("orphan_announcement_images");
    expect(removeMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ found: 0, removed: 0, failed: 0 });
  });

  it("efface les fichiers listés dans le bucket worlds, par lots de 100", async () => {
    const names = Array.from({ length: 230 }, (_, i) => nom(i));
    rpcMock.mockResolvedValue({ data: names, error: null });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(fromMock).toHaveBeenCalledWith("worlds");
    expect(removeMock.mock.calls.map(([lot]) => lot.length)).toEqual([100, 100, 30]);
    expect(removeMock.mock.calls.flatMap(([lot]) => lot)).toEqual(names);
    await expect(res.json()).resolves.toEqual({ found: 230, removed: 230, failed: 0 });
  });

  it("un lot refusé n'arrête pas les suivants", async () => {
    rpcMock.mockResolvedValue({ data: Array.from({ length: 150 }, (_, i) => nom(i)), error: null });
    removeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(removeMock).toHaveBeenCalledTimes(2);
    await expect(res.json()).resolves.toEqual({ found: 150, removed: 50, failed: 100 });
  });

  it("500 si la liste échoue", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(removeMock).not.toHaveBeenCalled();
  });
});
