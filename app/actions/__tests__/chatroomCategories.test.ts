import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  addChatroomCategory,
  updateChatroomCategory,
  deleteChatroomCategory,
  reorderChatroomCategories,
} from "@/app/actions/chatroomCategories";
import { createClient } from "@/lib/supabase/server";

// ──────────────────────────────────────────────────────────────────────────
// Actions serveur des catégories de salons. Elles n'avaient aucun test.
//
// L'autorisation n'est pas vérifiée ici : elle l'est par la RLS, qui réserve
// `chatroom_categories` aux éditeurs du monde. C'est la convention du dépôt et
// elle est saine — encore faut-il que le code ne fasse rien AVANT que la base
// ait tranché. C'était le défaut de la suppression, qui effaçait la bannière et
// l'icône avant de tenter la suppression de la ligne : refusée, la catégorie
// restait à l'écran avec des images cassées.
// ──────────────────────────────────────────────────────────────────────────

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

const BANNIERE =
  "https://x.supabase.co/storage/v1/object/public/chatroom-categories/world-abc/banner.webp";
const ICONE =
  "https://x.supabase.co/storage/v1/object/public/chatroom-categories/world-abc/icon.webp";

describe("deleteChatroomCategory", () => {
  it("ne touche AUCUN fichier quand la suppression de la ligne échoue", () => {
    // Le cas qui comptait : une personne sans droit d'édition. La base refuse,
    // et les images doivent rester intactes.
    const mock = createSupabaseMock({
      results: [{ data: null, error: { message: "row-level security" } }],
    });
    use(mock);

    return deleteChatroomCategory("cat1", BANNIERE, ICONE).then((res) => {
      expect(res.ok).toBe(false);
      expect(mock.storageRemove).not.toHaveBeenCalled();
    });
  });

  it("retire les fichiers une fois la ligne supprimée", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    use(mock);

    const res = await deleteChatroomCategory("cat1", BANNIERE, ICONE);

    expect(res.ok).toBe(true);
    expect(mock.storageRemove).toHaveBeenCalledWith([
      "world-abc/banner.webp",
      "world-abc/icon.webp",
    ]);
  });

  it("se passe de l'étape stockage quand il n'y a aucune image", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    use(mock);

    const res = await deleteChatroomCategory("cat1", null, null);

    expect(res.ok).toBe(true);
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });

  it("ignore une adresse qui ne désigne pas cet espace de stockage", async () => {
    // Les adresses viennent du client : rien ne garantit leur forme.
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    use(mock);

    const res = await deleteChatroomCategory("cat1", "https://ailleurs.test/image.png", null);

    expect(res.ok).toBe(true);
    expect(mock.storageRemove).not.toHaveBeenCalled();
  });
});

describe("addChatroomCategory", () => {
  it("place la nouvelle catégorie après la dernière", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: { position: 4 }, error: null }, // la position la plus haute
        { data: { id: "c1" }, error: null }, // l'insertion
      ],
    });
    use(mock);

    const res = await addChatroomCategory("w1", { title: "Taverne" });

    expect(res.ok).toBe(true);
    expect(mock.buildersFor("chatroom_categories")[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ world_id: "w1", position: 5, title: "Taverne" }),
    );
  });

  it("part de zéro quand le monde n'a encore aucune catégorie", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: null, error: null }, // aucune ligne
        { data: { id: "c1" }, error: null },
      ],
    });
    use(mock);

    await addChatroomCategory("w1", { title: "Première" });

    expect(mock.buildersFor("chatroom_categories")[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 0 }),
    );
  });

  it("n'insère rien si la lecture de la position échoue", async () => {
    // Sans cette garde, la catégorie serait créée à une position arbitraire.
    const mock = createSupabaseMock({
      results: [{ data: null, error: { message: "boom" } }],
    });
    use(mock);

    const res = await addChatroomCategory("w1", { title: "Taverne" });

    expect(res.ok).toBe(false);
    // Un seul builder : la lecture. Aucune insertion n'a été tentée.
    expect(mock.buildersFor("chatroom_categories")).toHaveLength(1);
  });
});

describe("updateChatroomCategory", () => {
  it("remonte l'erreur de la base telle quelle", async () => {
    const mock = createSupabaseMock({
      results: [{ data: null, error: { message: "row-level security" } }],
    });
    use(mock);

    const res = await updateChatroomCategory("c1", { title: "Nouveau" });

    // Le message brut de la base ne franchit plus la frontière : il reste dans
    // les journaux serveur, l'action ne renvoie qu'un code.
    expect(res).toEqual({ ok: false, error: "saveFailed" });
  });
});

describe("reorderChatroomCategories", () => {
  it("signale l'échec dès qu'une seule mise à jour échoue", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: null, error: null },
        { data: null, error: { message: "refusé" } },
        { data: null, error: null },
      ],
    });
    use(mock);

    const res = await reorderChatroomCategories([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);

    expect(res).toEqual({ ok: false, error: "saveFailed" });
  });

  it("accepte une liste vide sans rien tenter", async () => {
    const mock = createSupabaseMock({ results: [] });
    use(mock);

    expect(await reorderChatroomCategories([])).toEqual({ ok: true });
  });
});
