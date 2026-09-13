import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveWorldPrefs, toggleWorldFavorite } from "@/app/(protected)/w/actions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("saveWorldPrefs", () => {
  it("ne fait rien si l'utilisateur n'est pas connecté", async () => {
    const mock = createSupabaseMock({ user: null });
    use(mock);
    await saveWorldPrefs("w1", { main_expanded: true });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("upsert les préférences avec world_id + user_id", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await saveWorldPrefs("w1", { main_expanded: true, is_favorite: true });
    expect(mock.buildersFor("world_user_preferences")[0].upsert).toHaveBeenCalledWith(
      expect.objectContaining({ world_id: "w1", user_id: "u1", main_expanded: true }),
      { onConflict: "world_id,user_id" },
    );
  });
});

describe("toggleWorldFavorite", () => {
  it("revalide le layout après un upsert réussi", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] }));
    await toggleWorldFavorite("w1", true);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("ne revalide pas en cas d'erreur", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "x" } }] }));
    await toggleWorldFavorite("w1", true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveWorldPrefs — entrées forgées", () => {
  // `prefs` est étalé APRÈS `user_id` : une clé `user_id` glissée dans l'objet
  // aurait remplacé celle de l'appelant. La RLS l'aurait refusé ; on ne lui
  // pose plus la question.
  it("refuse un user_id glissé dans les préférences, sans appeler Supabase", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);
    await saveWorldPrefs("w1", { main_expanded: true, user_id: "victime" } as never);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("refuse une largeur qui n'est pas un entier borné", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    use(mock);
    await saveWorldPrefs("w1", { wiki_sidebar_width: 1e9 });
    expect(mock.from).not.toHaveBeenCalled();
  });
});
