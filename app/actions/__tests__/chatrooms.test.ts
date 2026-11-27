import { describe, it, expect, vi, beforeEach } from "vitest";

// Le stockage, vu par le service_role : `list` rend les fichiers d'un dossier,
// `remove` les efface.
const storageList = vi.fn();
const storageRemove = vi.fn();
const storageFrom = vi.fn((bucket: string) => ({
  list: (prefix: string, opts: unknown) => storageList(bucket, prefix, opts),
  remove: (paths: string[]) => storageRemove(bucket, paths),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: storageFrom } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { deleteChatroom } from "@/app/actions/chatrooms";
import { createClient } from "@/lib/supabase/server";

const CHAT = "11111111-1111-4111-8111-111111111111";

/** Client de l'appelant : ses claims, et ce que la RLS laisse supprimer. */
function mockCaller(sub: string | null, deleted: { id: string }[] | null, error: unknown = null) {
  const del = vi.fn();
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => ({
      delete: () => {
        del(table);
        const builder = {
          eq: (col: string, val: string) => {
            del(table, col, val);
            return builder;
          },
          select: () => Promise.resolve({ data: deleted, error }),
        };
        return builder;
      },
    }),
  } as never);
  return del;
}

beforeEach(() => {
  vi.clearAllMocks();
  storageList.mockImplementation(async (bucket: string) => ({
    data:
      bucket === "chatrooms"
        ? [{ name: "icon-1.webp" }, { name: "banner-2.webp" }]
        : bucket === "chat-media"
          ? [{ name: "a.png" }]
          : [],
    error: null,
  }));
  storageRemove.mockResolvedValue({ data: [], error: null });
});

describe("deleteChatroom", () => {
  it("supprime le salon sous l'identité de l'appelant, puis tous ses fichiers", async () => {
    const del = mockCaller("u1", [{ id: CHAT }]);

    expect(await deleteChatroom(CHAT)).toEqual({});

    expect(del).toHaveBeenCalledWith("chatrooms", "id", CHAT);
    expect(storageList).toHaveBeenCalledWith("chatrooms", `chatroom-${CHAT}`, expect.anything());
    expect(storageList).toHaveBeenCalledWith("chat-media", CHAT, expect.anything());
    expect(storageList).toHaveBeenCalledWith("chat-banners", CHAT, expect.anything());
    expect(storageRemove).toHaveBeenCalledWith("chatrooms", [`chatroom-${CHAT}/icon-1.webp`, `chatroom-${CHAT}/banner-2.webp`]);
    expect(storageRemove).toHaveBeenCalledWith("chat-media", [`${CHAT}/a.png`]);
  });

  it("un salon que l'appelant ne gère pas : la base ne supprime rien, les fichiers restent", async () => {
    mockCaller("u2", []);

    expect(await deleteChatroom(CHAT)).toEqual({ error: "forbidden" });
    expect(storageList).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("une erreur de la base : échec, les fichiers restent", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCaller("u1", null, { message: "boom" });

    expect(await deleteChatroom(CHAT)).toEqual({ error: "saveFailed" });
    expect(storageRemove).not.toHaveBeenCalled();
    erreur.mockRestore();
  });

  it("sans session : refusé", async () => {
    mockCaller(null, [{ id: CHAT }]);
    expect(await deleteChatroom(CHAT)).toEqual({ error: "unauthenticated" });
  });

  it("un identifiant invalide : refusé avant toute requête", async () => {
    const del = mockCaller("u1", [{ id: CHAT }]);
    expect(await deleteChatroom("")).toEqual({ error: "unsupportedValue" });
    expect(del).not.toHaveBeenCalled();
  });

  it("un dossier de plus de 1000 fichiers est vidé page après page", async () => {
    mockCaller("u1", [{ id: CHAT }]);
    const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ name: `f${from + i}.png` }));
    storageList.mockImplementation(async (bucket: string, _prefix: string, opts: { offset?: number }) => ({
      data: bucket === "chat-media" ? (opts.offset ? page(5, 1000) : page(1000, 0)) : [],
      error: null,
    }));

    expect(await deleteChatroom(CHAT)).toEqual({});
    const effaces = storageRemove.mock.calls.filter(([b]) => b === "chat-media").flatMap(([, p]) => p as string[]);
    expect(effaces).toHaveLength(1005);
  });
});
