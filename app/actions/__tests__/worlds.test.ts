import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const cookieStore = {
    get: vi.fn(),
    delete: vi.fn(),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { leaveWorld } from "@/app/actions/worlds";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.get.mockReturnValue(undefined);
});

describe("leaveWorld", () => {
    it("refuse si non connecté", async () => {
        use(createSupabaseMock({ user: null }));
        expect(await leaveWorld("w1")).toEqual({ ok: false, error: "Non authentifié" });
    });

    it("supprime la ligne world_members de l'utilisateur courant", async () => {
        const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
        use(mock);
        const res = await leaveWorld("w1");
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("world_members")[0].delete).toHaveBeenCalled();
        expect(mock.buildersFor("world_members")[0].eq).toHaveBeenCalledWith("world_id", "w1");
        expect(mock.buildersFor("world_members")[0].eq).toHaveBeenCalledWith("user_id", "u1");
    });

    it("remonte l'erreur Supabase (ex. propriétaire, bloqué par la RLS)", async () => {
        const mock = createSupabaseMock({
            user: { id: "u1" },
            results: [{ error: { message: "new row violates row-level security policy" } }],
        });
        use(mock);
        expect(await leaveWorld("w1")).toEqual({
            ok: false,
            error: "new row violates row-level security policy",
        });
    });

    it("efface le cookie last_world_id s'il pointe sur le monde quitté", async () => {
        cookieStore.get.mockReturnValue({ value: "w1" });
        use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] }));
        await leaveWorld("w1");
        expect(cookieStore.delete).toHaveBeenCalledWith("last_world_id");
    });

    it("n'efface pas le cookie s'il pointe sur un autre monde", async () => {
        cookieStore.get.mockReturnValue({ value: "w2" });
        use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] }));
        await leaveWorld("w1");
        expect(cookieStore.delete).not.toHaveBeenCalled();
    });
});
