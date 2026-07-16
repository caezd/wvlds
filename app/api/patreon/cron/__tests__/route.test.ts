import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { resyncMock } = vi.hoisted(() => ({
  resyncMock: vi.fn(async () => ({ processed: 2, errors: 0 })),
}));
vi.mock("@/lib/patreon/sync", () => ({ resyncStalePatreonAccounts: resyncMock }));
vi.mock("@/lib/patreon/config", () => ({ isPatreonEnabled: () => true }));

import { GET } from "../route";

const SECRET = "cron-secret-xyz";
function req(auth?: string) {
  return new NextRequest("http://localhost:3000/api/patreon/cron", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  resyncMock.mockClear();
});

describe("GET /api/patreon/cron — garde d'authentification", () => {
  it("401 sans en-tête Authorization", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(resyncMock).not.toHaveBeenCalled();
  });

  it("401 avec un mauvais secret", async () => {
    const res = await GET(req("Bearer mauvais"));
    expect(res.status).toBe(401);
    expect(resyncMock).not.toHaveBeenCalled();
  });

  it("401 si CRON_SECRET n'est pas configuré côté serveur", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer nimporte"));
    expect(res.status).toBe(401);
    expect(resyncMock).not.toHaveBeenCalled();
  });

  it("200 avec le bon secret, et lance le resync", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(resyncMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({ processed: 2, errors: 0 });
  });
});
