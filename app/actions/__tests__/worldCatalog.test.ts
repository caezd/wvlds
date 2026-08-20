import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/(protected)/p/actions", () => ({ deletePersona: vi.fn() }));

import {
    setWorldFeature,
    setWorldRestriction,
    setWorldFaceclaims,
    setWorldHomeShowStats,
    setWorldHomeGridGap,
    setWorldAgeRestricted,
    setWorldTimeline,
    setWorldPersonaTemplate,
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
    setWorldHomeGrid,
} from "@/app/actions/worldCatalog";
import { HOME_GRID_COLS, MAX_HOME_BLOCK_CONTENT_LENGTH, MAX_HOME_GRID_ITEMS } from "@/components/worlds/home/worldHomeGrid";
import { createClient } from "@/lib/supabase/server";
import { deletePersona } from "@/app/(protected)/p/actions";

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

// ── setWorldFaceclaims ────────────────────────────────────────────────────────

describe("setWorldFaceclaims", () => {
    it("active les faceclaims", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldFaceclaims("w1", true);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ enable_faceclaims: true });
    });

    it("désactive les faceclaims", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldFaceclaims("w1", false);
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ enable_faceclaims: false });
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        expect(await setWorldFaceclaims("w1", true)).toEqual({ ok: false, error: "nope" });
    });
});

// ── setWorldHomeShowStats ─────────────────────────────────────────────────────

describe("setWorldHomeShowStats", () => {
    it("active l'affichage des statistiques", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeShowStats("w1", true);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ home_show_stats: true });
    });

    it("désactive l'affichage des statistiques", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeShowStats("w1", false);
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ home_show_stats: false });
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        expect(await setWorldHomeShowStats("w1", true)).toEqual({ ok: false, error: "nope" });
    });
});

// ── setWorldHomeGridGap ────────────────────────────────────────────────────────

describe("setWorldHomeGridGap", () => {
    it("enregistre un préréglage valide", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGridGap("w1", "spacious");
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ home_grid_gap: "spacious" });
    });

    it("refuse une valeur qui n'est pas un préréglage connu, sans appeler Supabase", async () => {
        const mock = createSupabaseMock();
        use(mock);
        // @ts-expect-error — valeur volontairement hors du type, comme le
        // ferait un client obsolète ou un appel forgé.
        const res = await setWorldHomeGridGap("w1", "huge");
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        expect(await setWorldHomeGridGap("w1", "compact")).toEqual({ ok: false, error: "nope" });
    });
});

// ── setWorldAgeRestricted ─────────────────────────────────────────────────────

describe("setWorldAgeRestricted", () => {
    it("active la restriction et confirme l'âge de l'acteur", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldAgeRestricted("w1", true);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ is_age_restricted: true });
        expect(mock.rpc).toHaveBeenCalledWith("confirm_world_age", { p_world_id: "w1" });
    });

    it("désactive la restriction sans appeler confirm_world_age", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldAgeRestricted("w1", false);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ is_age_restricted: false });
        expect(mock.rpc).not.toHaveBeenCalled();
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        expect(await setWorldAgeRestricted("w1", true)).toEqual({ ok: false, error: "nope" });
    });
});

// ── setWorldTimeline ──────────────────────────────────────────────────────────

describe("setWorldTimeline", () => {
    const CONFIG = {
        year_label: "An",
        era_name: null,
        month_names: ["Janvier", "Février"],
        current_year: 1,
        current_month: null,
        days_per_month: [31, 28],
    };

    it("active/désactive et enregistre la config telle quelle quand elle est déjà valide", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldTimeline("w1", true, CONFIG);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({
            timeline_enabled: true,
            timeline_config: CONFIG,
        });
    });

    it("borne les jours par mois hors limites — les attributs min/max HTML côté client ne suffisent pas", async () => {
        // Régression (retour Copilot) : une valeur aberrante alimenterait
        // ensuite un `Array.from({ length })` dans le widget de calendrier.
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldTimeline("w1", true, { ...CONFIG, days_per_month: [0, 999999] });
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({
            timeline_enabled: true,
            timeline_config: { ...CONFIG, days_per_month: [1, 999] },
        });
    });

    it("désactive sans toucher timeline_config quand aucune config n'est fournie", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldTimeline("w1", false);
        expect(res).toEqual({ ok: true });
        expect(mock.buildersFor("worlds")[0].update).toHaveBeenCalledWith({ timeline_enabled: false });
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        expect(await setWorldTimeline("w1", true, CONFIG)).toEqual({ ok: false, error: "nope" });
    });
});

// ── setWorldPersonaTemplate ───────────────────────────────────────────────────

describe("setWorldPersonaTemplate", () => {
    it("refuse si non connecté", async () => {
        use(createSupabaseMock({ user: null }));
        expect(await setWorldPersonaTemplate("w1", true)).toMatchObject({ ok: false });
    });

    it("crée le persona modèle à l'activation", async () => {
        const mock = createSupabaseMock({
            user: { id: "u1" },
            results: [
                { data: null },              // lookup : pas de modèle existant
                { data: { id: "tpl1" } },    // insert
            ],
        });
        use(mock);
        const res = await setWorldPersonaTemplate("w1", true);
        expect(res).toEqual({ ok: true, templateId: "tpl1" });
        expect(mock.buildersFor("personas")[1].insert).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: "u1", world_id: "w1", is_template: true }),
        );
    });

    it("est idempotent si un modèle existe déjà", async () => {
        const mock = createSupabaseMock({
            user: { id: "u1" },
            results: [{ data: { id: "tpl1" } }],
        });
        use(mock);
        const res = await setWorldPersonaTemplate("w1", true);
        expect(res).toEqual({ ok: true, templateId: "tpl1" });
        expect(mock.buildersFor("personas")).toHaveLength(1); // pas d'insert
    });

    it("supprime le modèle à la désactivation", async () => {
        vi.mocked(deletePersona).mockResolvedValue({ ok: true });
        const mock = createSupabaseMock({
            user: { id: "u1" },
            results: [{ data: { id: "tpl1" } }],
        });
        use(mock);
        const res = await setWorldPersonaTemplate("w1", false);
        expect(res).toEqual({ ok: true, templateId: null });
        expect(deletePersona).toHaveBeenCalledWith("tpl1");
    });

    it("désactivation sans modèle existant : ok sans suppression", async () => {
        const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: null }] });
        use(mock);
        const res = await setWorldPersonaTemplate("w1", false);
        expect(res).toEqual({ ok: true, templateId: null });
        expect(deletePersona).not.toHaveBeenCalled();
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

// ── setWorldHomeGrid ──────────────────────────────────────────────────────

describe("setWorldHomeGrid", () => {
    it("enregistre un bloc widget valide en préservant son id", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "bloc-1", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written).toHaveLength(1);
        // L'id doit survivre à l'enregistrement : c'est la clé React et
        // l'identité react-grid-layout du bloc — le régénérer démonterait
        // tous les blocs à chaque sauvegarde (geste de resize cassé).
        expect(written[0]).toMatchObject({ id: "bloc-1", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" });
    });

    it("refuse un id dupliqué entre deux blocs", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "meme-id", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
            { id: "meme-id", type: "widget", x: 6, y: 0, w: 6, widgetId: "categories" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un id vide ou démesuré", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(
            (await setWorldHomeGrid("w1", [{ id: "", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" }])).ok,
        ).toBe(false);
        expect(
            (await setWorldHomeGrid("w1", [
                { id: "x".repeat(100), type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
            ])).ok,
        ).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("trim le HTML/Markdown avant enregistrement", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "  <p>x</p>  " },
            { id: "b", type: "markdown", x: 0, y: 4, w: 12, content: "  # x  " },
        ]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).toMatchObject({ type: "html", html: "<p>x</p>" });
        expect(written[1]).toMatchObject({ type: "markdown", content: "# x" });
    });

    it("refuse une valeur qui n'est pas un tableau, sans appeler Supabase", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", "not-an-array" as never);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse plus que le nombre maximal de blocs, sans appeler Supabase", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const items = Array.from({ length: MAX_HOME_GRID_ITEMS + 1 }, (_, i) => ({
            id: `i${i}`, type: "markdown", x: 0, y: i, w: 12, content: "x",
        }));
        const res = await setWorldHomeGrid("w1", items);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un widgetId inconnu, sans appeler Supabase", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "inconnu" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse 'announcement' comme widgetId — retiré au profit des blocs html", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "announcement" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un widgetId dupliqué entre deux blocs", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
            { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un bloc qui déborde la grille (x + w > 12)", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 8, y: 0, w: 6, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse des coordonnées non entières ou négatives", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: -1, w: 6, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse une largeur sous le minimum (w<2)", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 1, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("enregistre les réglages de widget bornés, en écartant les clés inconnues", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            {
                id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms",
                options: { visibleRows: 999, inconnu: 3 },
            },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0].options).toEqual({ visibleRows: 50 });
    });

    it("n'enregistre pas de réglages pour un widget qui n'en déclare aucun", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "categories", options: { visibleRows: 4 } },
        ]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).not.toHaveProperty("options");
    });

    it("renumérote les lignes en séquence (pas de ligne fantôme après suppression)", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" },
            { id: "b", type: "widget", x: 0, y: 3, w: 12, widgetId: "members_online" },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written.map((i: { y: number }) => i.y)).toEqual([0, 1]);
    });

    it("ignore une hauteur envoyée par un client obsolète — pas de h enregistré", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, h: 7, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).not.toHaveProperty("h");
    });

    it("refuse un contenu HTML dépassant la limite", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const tooLong = "a".repeat(MAX_HOME_BLOCK_CONTENT_LENGTH + 1);
        const res = await setWorldHomeGrid("w1", [{ id: "a", type: "html", x: 0, y: 0, w: 12, html: tooLong }]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un bloc widget qui porte aussi du contenu html", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms", html: "<p>x</p>" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un bloc html qui porte aussi un widgetId", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("accepte une largeur maximale égale au nombre de colonnes", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: HOME_GRID_COLS, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(true);
    });

    it("remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "nope" } }] }));
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
        ]);
        expect(res).toEqual({ ok: false, error: "nope" });
    });
});
