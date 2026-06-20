import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
    setWorldFeature,
    setWorldRestriction,
    addWorldInventoryItem,
    updateWorldInventoryItem,
    deleteWorldInventoryItem,
    addWorldSkill,
    updateWorldSkill,
    deleteWorldSkill,
    addWorldCatalogCategory,
    updateWorldCatalogCategory,
    deleteWorldCatalogCategory,
    batchUpdateCatalogCategoryOrder,
    batchUpdateCatalogItemOrder,
} from "@/app/actions/worldCatalog";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

// ── setWorldFeature ───────────────────────────────────────────────────────────

describe("setWorldFeature", () => {
    it("désactiver une fonctionnalité retire aussi sa restriction", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldFeature("w1", "enable_inventory", false);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({
            enable_inventory: false,
            restrict_inventory: false,
        });
    });

    it("activer une fonctionnalité ne touche pas la restriction", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldFeature("w1", "enable_skills", true);
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ enable_skills: true });
    });

    it("désactiver skills retire restrict_skills", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldFeature("w1", "enable_skills", false);
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({
            enable_skills: false,
            restrict_skills: false,
        });
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        expect(await setWorldFeature("w1", "enable_inventory", true)).toEqual({
            ok: false,
            error: "nope",
        });
    });
});

// ── setWorldRestriction ───────────────────────────────────────────────────────

describe("setWorldRestriction", () => {
    it("active la restriction sans purge quand aucun persona", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }, { data: [] }] });
        use(mock);
        const res = await setWorldRestriction("w1", "restrict_inventory", true);
        expect(res).toEqual({ ok: true });
        expect(mock.from).toHaveBeenCalledWith("personas");
        expect(mock.from).not.toHaveBeenCalledWith("persona_section_fields");
    });

    it("désactiver la restriction ne déclenche pas la purge", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldRestriction("w1", "restrict_skills", false);
        expect(mock.from).toHaveBeenCalledTimes(1);
    });

    it("purge les champs inventory quand des personas + sections existent", async () => {
        const mock = createSupabaseMock({
            results: [
                { error: null },                            // worlds.update
                { data: [{ id: "p1" }, { id: "p2" }] },   // personas.select
                { data: [{ id: "s1" }] },                  // persona_sections.select
                { error: null },                            // persona_section_fields.update
            ],
        });
        use(mock);
        const res = await setWorldRestriction("w1", "restrict_inventory", true);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("persona_section_fields")[0].update)
            .toHaveBeenCalledWith({ data: { inventoryItems: [] } });
        expect(mock.buildersFor("persona_section_fields")[0].eq)
            .toHaveBeenCalledWith("type", "inventory");
    });

    it("purge les champs skills (dataKey = skillItems)", async () => {
        const mock = createSupabaseMock({
            results: [
                { error: null },
                { data: [{ id: "p1" }] },
                { data: [{ id: "s1" }] },
                { error: null },
            ],
        });
        use(mock);
        await setWorldRestriction("w1", "restrict_skills", true);
        expect(mock.buildersFor("persona_section_fields")[0].update)
            .toHaveBeenCalledWith({ data: { skillItems: [] } });
        expect(mock.buildersFor("persona_section_fields")[0].eq)
            .toHaveBeenCalledWith("type", "skills");
    });

    it("ne purge pas si des personas existent mais aucune section", async () => {
        const mock = createSupabaseMock({
            results: [
                { error: null },
                { data: [{ id: "p1" }] },
                { data: [] },                              // sections vides
            ],
        });
        use(mock);
        await setWorldRestriction("w1", "restrict_inventory", true);
        expect(mock.from).not.toHaveBeenCalledWith("persona_section_fields");
    });
});

// ── CRUD world_inventory_items ────────────────────────────────────────────────

describe("CRUD world_inventory_items", () => {
    it("addWorldInventoryItem retourne l'item créé", async () => {
        const item = { id: "i1", name: "Épée" };
        use(createSupabaseMock({ results: [{ data: item, error: null }] }));
        expect(await addWorldInventoryItem("w1", { name: "Épée" })).toEqual({ ok: true, item });
    });

    it("addWorldInventoryItem avec options complètes", async () => {
        const item = { id: "i2", name: "Potion", description: "Soin", icon: "🧪", category_id: "cat1" };
        const mock = createSupabaseMock({ results: [{ data: item }] });
        use(mock);
        await addWorldInventoryItem("w1", { name: "Potion", description: "Soin", icon: "🧪", category_id: "cat1" });
        expect(mock.buildersFor("world_inventory_items")[0].insert).toHaveBeenCalledWith({
            world_id: "w1",
            name: "Potion",
            description: "Soin",
            icon: "🧪",
            category_id: "cat1",
        });
    });

    it("addWorldInventoryItem remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "fk" } }] }));
        expect(await addWorldInventoryItem("w1", { name: "x" })).toEqual({ ok: false, error: "fk" });
    });

    it("updateWorldInventoryItem — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await updateWorldInventoryItem("i1", { name: "Épée +1" })).toEqual({ ok: true });
    });

    it("updateWorldInventoryItem — erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "not found" } }] }));
        expect(await updateWorldInventoryItem("i1", { name: "x" })).toEqual({ ok: false, error: "not found" });
    });

    it("deleteWorldInventoryItem — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await deleteWorldInventoryItem("i1")).toEqual({ ok: true });
    });

    it("deleteWorldInventoryItem — erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "rls" } }] }));
        expect(await deleteWorldInventoryItem("i1")).toEqual({ ok: false, error: "rls" });
    });
});

// ── CRUD world_skills ─────────────────────────────────────────────────────────

describe("CRUD world_skills", () => {
    it("addWorldSkill retourne le skill créé", async () => {
        const skill = { id: "sk1", name: "Force" };
        use(createSupabaseMock({ results: [{ data: skill }] }));
        expect(await addWorldSkill("w1", { name: "Force" })).toEqual({ ok: true, skill });
    });

    it("addWorldSkill remonte l'erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "rls" } }] }));
        expect(await addWorldSkill("w1", { name: "x" })).toEqual({ ok: false, error: "rls" });
    });

    it("updateWorldSkill — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await updateWorldSkill("sk1", { description: "Puissance physique" })).toEqual({ ok: true });
    });

    it("deleteWorldSkill — erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "fk" } }] }));
        expect(await deleteWorldSkill("s1")).toEqual({ ok: false, error: "fk" });
    });
});

// ── CRUD world_catalog_categories ────────────────────────────────────────────

describe("CRUD world_catalog_categories", () => {
    it("addWorldCatalogCategory avec valeurs par défaut", async () => {
        const cat = { id: "c1", name: "Armes", type: "inventory", column_index: 0, sort_index: 0 };
        const mock = createSupabaseMock({ results: [{ data: cat }] });
        use(mock);
        const res = await addWorldCatalogCategory("w1", "inventory", "Armes");
        expect(res).toEqual({ ok: true, category: cat });
        expect(mock.buildersFor("world_catalog_categories")[0].insert).toHaveBeenCalledWith({
            world_id: "w1",
            type: "inventory",
            name: "Armes",
            column_index: 0,
            sort_index: 0,
        });
    });

    it("addWorldCatalogCategory avec options personnalisées", async () => {
        const cat = { id: "c2", column_index: 1, sort_index: 3 };
        const mock = createSupabaseMock({ results: [{ data: cat }] });
        use(mock);
        await addWorldCatalogCategory("w1", "skills", "Magie", { column_index: 1, sort_index: 3 });
        expect(mock.buildersFor("world_catalog_categories")[0].insert).toHaveBeenCalledWith({
            world_id: "w1",
            type: "skills",
            name: "Magie",
            column_index: 1,
            sort_index: 3,
        });
    });

    it("addWorldCatalogCategory remonte l'erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "dup" } }] }));
        expect(await addWorldCatalogCategory("w1", "inventory", "x")).toEqual({ ok: false, error: "dup" });
    });

    it("updateWorldCatalogCategory — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await updateWorldCatalogCategory("c1", { name: "Armures" })).toEqual({ ok: true });
    });

    it("deleteWorldCatalogCategory — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await deleteWorldCatalogCategory("c1")).toEqual({ ok: true });
    });
});

// ── batchUpdateCatalogCategoryOrder ──────────────────────────────────────────

describe("batchUpdateCatalogCategoryOrder", () => {
    it("appelle update pour chaque catégorie avec les bons champs", async () => {
        const categories = [
            { id: "c1", sort_index: 0, column_index: 0 },
            { id: "c2", sort_index: 1, column_index: 1 },
            { id: "c3", sort_index: 2, column_index: 1 },
        ];
        const mock = createSupabaseMock({
            results: [{ error: null }, { error: null }, { error: null }],
        });
        use(mock);
        const res = await batchUpdateCatalogCategoryOrder(categories);
        expect(res).toEqual({ ok: true });
        const builders = mock.buildersFor("world_catalog_categories");
        expect(builders).toHaveLength(3);
        expect(builders[0].update).toHaveBeenCalledWith({ sort_index: 0, column_index: 0 });
        expect(builders[1].update).toHaveBeenCalledWith({ sort_index: 1, column_index: 1 });
        expect(builders[2].update).toHaveBeenCalledWith({ sort_index: 2, column_index: 1 });
    });

    it("retourne ok:true même avec 0 catégories", async () => {
        use(createSupabaseMock());
        expect(await batchUpdateCatalogCategoryOrder([])).toEqual({ ok: true });
    });
});

// ── batchUpdateCatalogItemOrder ───────────────────────────────────────────────

describe("batchUpdateCatalogItemOrder", () => {
    it("utilise world_inventory_items pour le type inventory", async () => {
        const items = [
            { id: "i1", sort_index: 0, category_id: "cat1" },
            { id: "i2", sort_index: 1, category_id: null },
        ];
        const mock = createSupabaseMock({ results: [{ error: null }, { error: null }] });
        use(mock);
        await batchUpdateCatalogItemOrder(items, "inventory");
        expect(mock.buildersFor("world_inventory_items")).toHaveLength(2);
        expect(mock.buildersFor("world_skills")).toHaveLength(0);
    });

    it("utilise world_skills pour le type skills", async () => {
        const items = [{ id: "sk1", sort_index: 0, category_id: null }];
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await batchUpdateCatalogItemOrder(items, "skills");
        expect(mock.buildersFor("world_skills")).toHaveLength(1);
        expect(mock.buildersFor("world_inventory_items")).toHaveLength(0);
    });

    it("passe sort_index et category_id à update", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await batchUpdateCatalogItemOrder([{ id: "i1", sort_index: 5, category_id: "cat2" }], "inventory");
        expect(mock.buildersFor("world_inventory_items")[0].update)
            .toHaveBeenCalledWith({ sort_index: 5, category_id: "cat2" });
    });
});
