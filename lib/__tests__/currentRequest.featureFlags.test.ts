import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { DEFAULT_FLAGS, FEATURE_FLAGS_TAG } from "@/lib/featureFlags";

// `unstable_cache` remplacé par un passe-plat qui enregistre ses options.
const cacheOptions = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown, _keys: string[], options: unknown) => {
    cacheOptions.value = options;
    return fn;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ENV = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});
afterEach(() => {
  if (ENV === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ENV;
});

async function load() {
  return (await import("@/lib/currentRequest")).getCachedFeatureFlags;
}

describe("getCachedFeatureFlags", () => {
  it("lit les drapeaux par le cache partagé, étiqueté et borné dans le temps", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cle";
    const admin = createSupabaseMock({ results: [{ data: [{ key: "shop", enabled: false }] }] });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);

    const flags = await (await load())();

    expect(flags.shop).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
    expect(cacheOptions.value).toEqual({ tags: [FEATURE_FLAGS_TAG], revalidate: 60 });
  });

  it("retombe sur la lecture par la session si la lecture partagée échoue", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cle";
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = createSupabaseMock({ results: [{ data: null, error: { message: "boom" } }] });
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never);
    const session = createSupabaseMock({ results: [{ data: [{ key: "quests", enabled: true }] }] });
    vi.mocked(createClient).mockResolvedValue(session.client as never);

    const flags = await (await load())();

    expect(flags.quests).toBe(true);
    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });

  it("sans clé de service, lit par la session comme avant", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const session = createSupabaseMock({ results: [{ data: [] }] });
    vi.mocked(createClient).mockResolvedValue(session.client as never);

    const flags = await (await load())();

    expect(flags).toEqual(DEFAULT_FLAGS);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
