import { describe, it, expect, vi } from "vitest";
import { fetchPersonasByMember } from "@/lib/worldMemberPersonas";
import { RPC } from "@/lib/constants";

function clientReturning(result: { data?: unknown; error?: unknown }) {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
    return { client: { rpc } as never, rpc };
}

describe("fetchPersonasByMember", () => {
    it("appelle la RPC avec l'id du monde", async () => {
        const { client, rpc } = clientReturning({ data: [] });
        await fetchPersonasByMember(client, "w1");

        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith(RPC.GET_WORLD_MEMBER_PERSONAS, { p_world_id: "w1" });
    });

    it("indexe les personas par membre", async () => {
        const { client } = clientReturning({
            data: [
                { user_id: "u1", persona_id: "p1", name: "Alia", avatar_url: "a1.png" },
                { user_id: "u1", persona_id: "p2", name: "Borin", avatar_url: null },
                { user_id: "u2", persona_id: "p3", name: "Cyl", avatar_url: null },
            ],
        });

        const byUser = await fetchPersonasByMember(client, "w1");

        expect([...byUser.keys()].sort()).toEqual(["u1", "u2"]);
        expect(byUser.get("u1")).toEqual([
            { id: "p1", name: "Alia", avatar_url: "a1.png" },
            { id: "p2", name: "Borin", avatar_url: null },
        ]);
        expect(byUser.get("u2")).toEqual([{ id: "p3", name: "Cyl", avatar_url: null }]);
    });

    it("ignore les lignes sans membre ou sans persona", async () => {
        const { client } = clientReturning({
            data: [
                { user_id: null, persona_id: "p1", name: "Orpheline", avatar_url: null },
                { user_id: "u1", persona_id: null, name: null, avatar_url: null },
                { user_id: "u1", persona_id: "p2", name: "Valide", avatar_url: null },
            ],
        });

        const byUser = await fetchPersonasByMember(client, "w1");

        expect(byUser.size).toBe(1);
        expect(byUser.get("u1")).toEqual([{ id: "p2", name: "Valide", avatar_url: null }]);
    });

    it("normalise un nom absent en chaîne vide", async () => {
        const { client } = clientReturning({
            data: [{ user_id: "u1", persona_id: "p1", name: null, avatar_url: null }],
        });

        const byUser = await fetchPersonasByMember(client, "w1");
        expect(byUser.get("u1")).toEqual([{ id: "p1", name: "", avatar_url: null }]);
    });

    it("renvoie une map vide en cas d'erreur RPC, sans lever", async () => {
        const { client } = clientReturning({ error: { message: "boom" } });
        await expect(fetchPersonasByMember(client, "w1")).resolves.toEqual(new Map());
    });

    it("renvoie une map vide quand la RPC ne renvoie rien", async () => {
        const { client } = clientReturning({ data: null });
        await expect(fetchPersonasByMember(client, "w1")).resolves.toEqual(new Map());
    });
});
