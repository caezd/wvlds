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
    getWorldPersonaTemplate,
    addWorldCatalogItem,
    updateWorldCatalogItem,
    trashWorldCatalogItem,
    restoreWorldCatalogItem,
    purgeWorldCatalogItem,
    listTrashedWorldCatalogItems,
    duplicateWorldCatalogItem,
    addWorldCatalogCategory,
    updateWorldCatalogCategory,
    deleteWorldCatalogCategory,
    reorderWorldCatalogCategories,
    reorderWorldCatalogItems,
    getWorldCatalogUsage,
    importWorldCatalogItems,
    setWorldHomeGrid,
} from "@/app/actions/worldCatalog";
import {
    HOME_GRID_COLS,
    MAX_HOME_BLOCK_CONTENT_LENGTH,
    MAX_HOME_BLOCK_CSS_LENGTH,
    MAX_HOME_BLOCK_HEIGHT,
    MAX_HOME_GRID_ITEMS,
    MIN_HOME_BLOCK_HEIGHT,
} from "@/components/worlds/home/worldHomeGrid";
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
            error: "saveFailed",
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
        expect(await setWorldFaceclaims("w1", true)).toEqual({ ok: false, error: "saveFailed" });
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
        expect(await setWorldHomeShowStats("w1", true)).toEqual({ ok: false, error: "saveFailed" });
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
        expect(await setWorldHomeGridGap("w1", "compact")).toEqual({ ok: false, error: "saveFailed" });
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
        expect(await setWorldAgeRestricted("w1", true)).toEqual({ ok: false, error: "saveFailed" });
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
        expect(await setWorldTimeline("w1", true, CONFIG)).toEqual({ ok: false, error: "saveFailed" });
    });
});

// ── setWorldPersonaTemplate ───────────────────────────────────────────────────

describe("getWorldPersonaTemplate", () => {
    // La lecture qui décide de l'affichage : un `templateId` erroné enverrait
    // l'éditeur de fiche par défaut sur le mauvais persona, ou l'ouvrirait
    // alors qu'aucun modèle n'existe.

    it("rend l'identifiant du modèle du monde visé", async () => {
        const mock = createSupabaseMock({ results: [{ data: { id: "tpl1" } }] });
        use(mock);

        expect(await getWorldPersonaTemplate("w1")).toEqual({ ok: true, templateId: "tpl1" });

        const b = mock.buildersFor("personas")[0];
        expect(b.eq).toHaveBeenCalledWith("world_id", "w1");
        // Sans ce filtre, le premier persona venu du monde passerait pour le
        // modèle.
        expect(b.eq).toHaveBeenCalledWith("is_template", true);
    });

    it("rend null, et non une erreur, quand le monde n'a pas de modèle", async () => {
        // C'est le cas ordinaire : la plupart des mondes n'en ont pas.
        use(createSupabaseMock({ results: [{ data: null }] }));
        expect(await getWorldPersonaTemplate("w1")).toEqual({ ok: true, templateId: null });
    });

    it("rend un code, jamais le message de la base", async () => {
        const brut = 'permission denied for table "personas"';
        use(createSupabaseMock({ results: [{ data: null, error: { message: brut } }] }));

        const res = await getWorldPersonaTemplate("w1");
        expect(res).toEqual({ ok: false, error: "saveFailed" });
        expect(JSON.stringify(res)).not.toContain("personas");
    });
});

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

// ── CRUD world_catalog_items ──────────────────────────────────────────────────

describe("CRUD world_catalog_items", () => {
    it("addWorldCatalogItem écrit le type et les valeurs nettoyées", async () => {
        const item = { id: "i1", name: "Épée" };
        const mock = createSupabaseMock({ results: [{ data: item, error: null }] });
        use(mock);
        expect(await addWorldCatalogItem("w1", "inventory", { name: "  Épée  " }))
            .toEqual({ ok: true, item });
        expect(mock.buildersFor("world_catalog_items")[0].insert).toHaveBeenCalledWith({
            world_id: "w1",
            type: "inventory",
            category_id: null,
            name: "Épée",
        });
    });

    it("addWorldCatalogItem porte la rareté, l'empilement et les propriétés", async () => {
        const mock = createSupabaseMock({ results: [{ data: { id: "i2" } }] });
        use(mock);
        await addWorldCatalogItem("w1", "inventory", {
            name: "Potion",
            rarity: "rare",
            stackable: false,
            max_quantity: 3,
            properties: [{ label: "Poids", value: "1 kg" }],
        });
        expect(mock.buildersFor("world_catalog_items")[0].insert).toHaveBeenCalledWith({
            world_id: "w1",
            type: "inventory",
            category_id: null,
            name: "Potion",
            rarity: "rare",
            stackable: false,
            max_quantity: 3,
            properties: [{ label: "Poids", value: "1 kg" }],
        });
    });

    it("addWorldCatalogItem refuse un nom vide", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await addWorldCatalogItem("w1", "inventory", { name: "   " }))
            .toEqual({ ok: false, error: "unsupportedValue" });
        expect(mock.buildersFor("world_catalog_items")).toHaveLength(0);
    });

    it("addWorldCatalogItem refuse un type inconnu", async () => {
        use(createSupabaseMock());
        expect(await addWorldCatalogItem("w1", "spells" as "inventory", { name: "x" }))
            .toEqual({ ok: false, error: "unsupportedValue" });
    });

    it("addWorldCatalogItem refuse une rareté hors liste", async () => {
        use(createSupabaseMock());
        expect(await addWorldCatalogItem("w1", "inventory", {
            name: "x",
            rarity: "mythique" as "rare",
        })).toEqual({ ok: false, error: "unsupportedValue" });
    });

    it("addWorldCatalogItem refuse un plafond nul ou négatif", async () => {
        use(createSupabaseMock());
        expect(await addWorldCatalogItem("w1", "inventory", { name: "x", max_quantity: 0 }))
            .toEqual({ ok: false, error: "unsupportedValue" });
    });

    // La RLS laisse écrire dans SON monde ; elle ne dit rien du monde auquel
    // appartient la catégorie visée. Sans ce contrôle, l'objet se rangeait
    // sous une catégorie d'ailleurs et disparaissait de l'affichage.
    it("addWorldCatalogItem refuse une catégorie étrangère au monde", async () => {
        const mock = createSupabaseMock({ results: [{ data: null }] });
        use(mock);
        expect(await addWorldCatalogItem("w1", "inventory", { name: "x", category_id: "cat-ailleurs" }))
            .toEqual({ ok: false, error: "unsupportedValue" });
        expect(mock.buildersFor("world_catalog_items")).toHaveLength(0);
    });

    it("addWorldCatalogItem accepte une catégorie du même monde et du même type", async () => {
        const mock = createSupabaseMock({
            results: [{ data: { id: "cat1" } }, { data: { id: "i3" } }],
        });
        use(mock);
        const res = await addWorldCatalogItem("w1", "inventory", { name: "x", category_id: "cat1" });
        expect(res.ok).toBe(true);
        expect(mock.buildersFor("world_catalog_items")[0].insert).toHaveBeenCalledWith(
            expect.objectContaining({ category_id: "cat1" }),
        );
    });

    it("addWorldCatalogItem remonte l'erreur Supabase", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "fk" } }] }));
        expect(await addWorldCatalogItem("w1", "inventory", { name: "x" }))
            .toEqual({ ok: false, error: "saveFailed" });
    });

    it("updateWorldCatalogItem — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await updateWorldCatalogItem("i1", { name: "Épée +1" })).toEqual({ ok: true });
    });

    it("updateWorldCatalogItem assainit les propriétés reçues", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await updateWorldCatalogItem("i1", {
            properties: [
                { label: " Poids ", value: " 1 kg " },
                { label: "", value: "orpheline" },
            ] as { label: string; value: string }[],
        });
        expect(mock.buildersFor("world_catalog_items")[0].update).toHaveBeenCalledWith({
            properties: [{ label: "Poids", value: "1 kg" }],
        });
    });

    it("updateWorldCatalogItem sans champ connu n'écrit rien", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await updateWorldCatalogItem("i1", {})).toEqual({ ok: true });
        expect(mock.buildersFor("world_catalog_items")).toHaveLength(0);
    });

    it("updateWorldCatalogItem refuse une catégorie d'un autre type", async () => {
        const mock = createSupabaseMock({
            results: [{ data: { world_id: "w1", type: "inventory" } }, { data: null }],
        });
        use(mock);
        expect(await updateWorldCatalogItem("i1", { category_id: "cat-skills" }))
            .toEqual({ ok: false, error: "unsupportedValue" });
    });

    it("updateWorldCatalogItem sur un objet introuvable", async () => {
        use(createSupabaseMock({ results: [{ data: null }] }));
        expect(await updateWorldCatalogItem("i1", { category_id: "cat1" }))
            .toEqual({ ok: false, error: "notFound" });
    });

    it("updateWorldCatalogItem — erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "rls" } }] }));
        expect(await updateWorldCatalogItem("i1", { name: "x" }))
            .toEqual({ ok: false, error: "saveFailed" });
    });

    it("addWorldCatalogItem refuse une icône Lucide inconnue", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await addWorldCatalogItem("w1", "skills", { name: "x", lucide_icon: "epee-longue" }))
            .toEqual({ ok: false, error: "unsupportedValue" });
        expect(mock.buildersFor("world_catalog_items")).toHaveLength(0);
    });

    it("addWorldCatalogItem accepte une icône Lucide de la bibliothèque", async () => {
        const mock = createSupabaseMock({ results: [{ data: { id: "s1" } }] });
        use(mock);
        const res = await addWorldCatalogItem("w1", "skills", { name: "Escrime", lucide_icon: "swords" });
        expect(res.ok).toBe(true);
        expect(mock.buildersFor("world_catalog_items")[0].insert).toHaveBeenCalledWith(
            expect.objectContaining({ lucide_icon: "swords" }),
        );
    });

    it("updateWorldCatalogItem accepte de retirer l'icône Lucide", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        expect(await updateWorldCatalogItem("i1", { lucide_icon: null })).toEqual({ ok: true });
        expect(mock.buildersFor("world_catalog_items")[0].update)
            .toHaveBeenCalledWith({ lucide_icon: null });
    });

    // Deux lignes qui pointent le même fichier : supprimer l'une emporterait
    // l'image de l'autre au ménage.
    it("duplicateWorldCatalogItem ne recopie pas l'image", async () => {
        const source = {
            id: "i1", world_id: "w1", type: "inventory", category_id: "cat1",
            name: "Épée", description: "Tranchante", icon: "sword.svg",
            image_url: "https://x/img.webp", rarity: "rare", stackable: false,
            max_quantity: 2, properties: [{ label: "Poids", value: "1 kg" }], sort_index: 4,
        };
        const mock = createSupabaseMock({ results: [{ data: source }, { data: { id: "i2" } }] });
        use(mock);
        const res = await duplicateWorldCatalogItem("i1");
        expect(res.ok).toBe(true);
        const inserted = mock.buildersFor("world_catalog_items")[1].insert.mock.calls[0][0];
        expect(inserted).not.toHaveProperty("image_url");
        expect(inserted.name).toBe("Épée 2");
        expect(inserted.sort_index).toBe(5);
        expect(inserted.rarity).toBe("rare");
    });

    it("duplicateWorldCatalogItem sur un objet introuvable", async () => {
        use(createSupabaseMock({ results: [{ data: null }] }));
        expect(await duplicateWorldCatalogItem("i1")).toEqual({ ok: false, error: "notFound" });
    });
});

// ── Corbeille ────────────────────────────────────────────────────────────────
// Supprimer un objet ne l'efface plus : il est marqué (migration 165). Ce qui
// se vérifie ici, c'est que la suppression écrit bien `deleted_at` au lieu de
// `delete()`, et que la purge fait le ménage du stockage AVANT la ligne — une
// ligne effacée d'abord laisserait son image sans plus rien pour la retrouver.

describe("corbeille du catalogue", () => {
    it("trashWorldCatalogItem marque au lieu d'effacer", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        expect(await trashWorldCatalogItem("i1")).toEqual({ ok: true });
        const builder = mock.buildersFor("world_catalog_items")[0];
        expect(builder.delete).not.toHaveBeenCalled();
        expect(builder.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    });

    it("trashWorldCatalogItem remonte l'erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "rls" } }] }));
        expect(await trashWorldCatalogItem("i1")).toEqual({ ok: false, error: "saveFailed" });
    });

    it("restoreWorldCatalogItem efface la marque et rend l'objet", async () => {
        const item = { id: "i1", name: "Épée", category_id: null };
        const mock = createSupabaseMock({ results: [{ data: item }] });
        use(mock);
        expect(await restoreWorldCatalogItem("i1")).toEqual({ ok: true, item });
        expect(mock.buildersFor("world_catalog_items")[0].update)
            .toHaveBeenCalledWith({ deleted_at: null });
    });

    it("restoreWorldCatalogItem sur un objet introuvable", async () => {
        use(createSupabaseMock({ results: [{ data: null }] }));
        expect(await restoreWorldCatalogItem("i1")).toEqual({ ok: false, error: "notFound" });
    });

    it("listTrashedWorldCatalogItems ne demande que les lignes marquées", async () => {
        const mock = createSupabaseMock({ results: [{ data: [{ id: "i1" }] }] });
        use(mock);
        const res = await listTrashedWorldCatalogItems("w1", "inventory");
        expect(res).toEqual({ ok: true, items: [{ id: "i1" }] });
        const builder = mock.buildersFor("world_catalog_items")[0];
        expect(builder.not).toHaveBeenCalledWith("deleted_at", "is", null);
        expect(builder.eq).toHaveBeenCalledWith("type", "inventory");
    });

    // Le ménage passe par la LISTE du dossier, et non par l'URL de la ligne :
    // une image téléversée puis abandonnée n'est référencée nulle part et
    // bloquerait à jamais la purge automatique.
    it("purgeWorldCatalogItem vide le dossier avant d'effacer la ligne", async () => {
        const mock = createSupabaseMock({
            results: [{ data: { id: "i1", world_id: "w1", image_url: null } }, { error: null }],
            storageListResult: [{ name: "a.webp" }, { name: "orpheline.webp" }],
        });
        use(mock);
        expect(await purgeWorldCatalogItem("i1")).toEqual({ ok: true });
        expect(mock.storageRemove).toHaveBeenCalledWith([
            "world-w1/item-i1/a.webp",
            "world-w1/item-i1/orpheline.webp",
        ]);
        expect(mock.buildersFor("world_catalog_items")[1].delete).toHaveBeenCalled();
    });

    it("purgeWorldCatalogItem rattrape l'image de la ligne si la liste ne la rend pas", async () => {
        const mock = createSupabaseMock({
            results: [
                {
                    data: {
                        id: "i1",
                        world_id: "w1",
                        image_url: "https://x.supabase.co/storage/v1/object/public/worlds/world-w1/item-i1/z.webp",
                    },
                },
                { error: null },
            ],
            storageListResult: [],
        });
        use(mock);
        await purgeWorldCatalogItem("i1");
        expect(mock.storageRemove).toHaveBeenCalledWith(["world-w1/item-i1/z.webp"]);
    });

    it("purgeWorldCatalogItem sur un objet introuvable", async () => {
        use(createSupabaseMock({ results: [{ data: null }] }));
        expect(await purgeWorldCatalogItem("i1")).toEqual({ ok: false, error: "notFound" });
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

    it("addWorldCatalogCategory refuse un nom vide", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await addWorldCatalogCategory("w1", "inventory", "  "))
            .toEqual({ ok: false, error: "unsupportedValue" });
        expect(mock.buildersFor("world_catalog_categories")).toHaveLength(0);
    });

    it("addWorldCatalogCategory remonte l'erreur", async () => {
        use(createSupabaseMock({ results: [{ error: { message: "dup" } }] }));
        expect(await addWorldCatalogCategory("w1", "inventory", "x")).toEqual({ ok: false, error: "saveFailed" });
    });

    it("updateWorldCatalogCategory — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await updateWorldCatalogCategory("c1", { name: "Armures" })).toEqual({ ok: true });
    });

    it("updateWorldCatalogCategory refuse un nom vide", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await updateWorldCatalogCategory("c1", { name: " " }))
            .toEqual({ ok: false, error: "unsupportedValue" });
        expect(mock.buildersFor("world_catalog_categories")).toHaveLength(0);
    });

    it("deleteWorldCatalogCategory — succès", async () => {
        use(createSupabaseMock({ results: [{ error: null }] }));
        expect(await deleteWorldCatalogCategory("c1")).toEqual({ ok: true });
    });
});

// ── Réordonnancement ─────────────────────────────────────────────────────────
// Le point délicat n'est pas la RPC, c'est son compte : une RLS qui refuse ne
// lève pas d'erreur, elle ne met à jour aucune ligne. Sans comparaison des
// nombres, l'action confirmerait un ordre que la base n'a pas enregistré.

describe("reorderWorldCatalogItems", () => {
    it("passe la liste entière à la RPC", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: 2, error: null });
        use(mock);
        const items = [
            { id: "i1", sort_index: 0, category_id: null },
            { id: "i2", sort_index: 1, category_id: "c1" },
        ];
        expect(await reorderWorldCatalogItems(items)).toEqual({ ok: true });
        expect(mock.rpc).toHaveBeenCalledWith("reorder_world_catalog_items", { p_items: items });
    });

    it("signale le refus silencieux d'une RLS", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: 1, error: null });
        use(mock);
        expect(await reorderWorldCatalogItems([
            { id: "i1", sort_index: 0, category_id: null },
            { id: "i2", sort_index: 1, category_id: null },
        ])).toEqual({ ok: false, error: "forbidden" });
    });

    it("remonte l'erreur de la RPC", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
        use(mock);
        expect(await reorderWorldCatalogItems([{ id: "i1", sort_index: 0, category_id: null }]))
            .toEqual({ ok: false, error: "saveFailed" });
    });

    it("n'appelle rien pour une liste vide", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await reorderWorldCatalogItems([])).toEqual({ ok: true });
        expect(mock.rpc).not.toHaveBeenCalled();
    });
});

describe("reorderWorldCatalogCategories", () => {
    it("passe la liste entière à la RPC", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: 1, error: null });
        use(mock);
        const categories = [{ id: "c1", sort_index: 0, column_index: 1 }];
        expect(await reorderWorldCatalogCategories(categories)).toEqual({ ok: true });
        expect(mock.rpc).toHaveBeenCalledWith("reorder_world_catalog_categories", {
            p_categories: categories,
        });
    });

    it("signale le refus silencieux d'une RLS", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: 0, error: null });
        use(mock);
        expect(await reorderWorldCatalogCategories([{ id: "c1", sort_index: 0, column_index: 0 }]))
            .toEqual({ ok: false, error: "forbidden" });
    });

    it("retourne ok:true pour 0 catégorie", async () => {
        const mock = createSupabaseMock();
        use(mock);
        expect(await reorderWorldCatalogCategories([])).toEqual({ ok: true });
        expect(mock.rpc).not.toHaveBeenCalled();
    });
});

// ── Décompte d'usage ─────────────────────────────────────────────────────────

describe("getWorldCatalogUsage", () => {
    it("indexe le décompte par objet", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({
            data: [
                { catalog_id: "i1", persona_count: 3 },
                { catalog_id: "i2", persona_count: 1 },
            ],
            error: null,
        });
        use(mock);
        expect(await getWorldCatalogUsage("w1")).toEqual({ ok: true, usage: { i1: 3, i2: 1 } });
        expect(mock.rpc).toHaveBeenCalledWith("world_catalog_usage", { p_world_id: "w1" });
    });

    it("rend un décompte vide quand la RPC ne renvoie rien", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: null, error: null });
        use(mock);
        expect(await getWorldCatalogUsage("w1")).toEqual({ ok: true, usage: {} });
    });

    it("remonte l'erreur", async () => {
        const mock = createSupabaseMock();
        mock.rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
        use(mock);
        expect(await getWorldCatalogUsage("w1")).toEqual({ ok: false, error: "saveFailed" });
    });
});

// ── Import ───────────────────────────────────────────────────────────────────

describe("importWorldCatalogItems", () => {
    it("réutilise une catégorie existante, sans tenir compte de la casse", async () => {
        const mock = createSupabaseMock({
            results: [
                { data: [{ id: "c1", name: "Armes" }] },
                { data: [{ id: "x1" }] },
            ],
        });
        use(mock);
        const res = await importWorldCatalogItems("w1", "inventory", [
            { name: "Épée", category: "armes" },
        ]);
        expect(res.ok).toBe(true);
        // Une seule écriture sur les catégories : aucune n'a été créée.
        expect(mock.buildersFor("world_catalog_categories")).toHaveLength(1);
        expect(mock.buildersFor("world_catalog_items")[0].insert).toHaveBeenCalledWith([
            expect.objectContaining({ category_id: "c1", name: "Épée", sort_index: 0 }),
        ]);
    });

    it("crée les catégories que le fichier nomme et qui manquent", async () => {
        const mock = createSupabaseMock({
            results: [
                { data: [] },
                { data: [{ id: "c9", name: "Armures" }] },
                { data: [{ id: "x1" }] },
            ],
        });
        use(mock);
        await importWorldCatalogItems("w1", "inventory", [{ name: "Cotte", category: "Armures" }]);
        expect(mock.buildersFor("world_catalog_categories")[1].insert).toHaveBeenCalledWith([
            { world_id: "w1", type: "inventory", name: "Armures", column_index: 0, sort_index: 0 },
        ]);
        expect(mock.buildersFor("world_catalog_items")[0].insert).toHaveBeenCalledWith([
            expect.objectContaining({ category_id: "c9" }),
        ]);
    });

    it("écarte les entrées sans nom plutôt que de tout refuser", async () => {
        const mock = createSupabaseMock({
            results: [{ data: [] }, { data: [{ id: "x1" }] }],
        });
        use(mock);
        const res = await importWorldCatalogItems("w1", "skills", [
            { name: "  " },
            { name: "Force" },
        ]);
        expect(res.ok).toBe(true);
        const rows = mock.buildersFor("world_catalog_items")[0].insert.mock.calls[0][0];
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Force");
    });

    it("refuse un import vide", async () => {
        use(createSupabaseMock());
        expect(await importWorldCatalogItems("w1", "inventory", []))
            .toEqual({ ok: false, error: "unsupportedValue" });
    });

    it("refuse un type inconnu", async () => {
        use(createSupabaseMock());
        expect(await importWorldCatalogItems("w1", "spells" as "inventory", [{ name: "x" }]))
            .toEqual({ ok: false, error: "unsupportedValue" });
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

    it("enregistre la hauteur d'un bloc html ou markdown", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", h: 320 },
            { id: "b", type: "markdown", x: 0, y: 1, w: 12, content: "x", h: 240 },
        ]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).toMatchObject({ type: "html", h: 320 });
        expect(written[1]).toMatchObject({ type: "markdown", h: 240 });
    });

    it("borne une hauteur hors limites au lieu de rejeter le bloc", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", h: 5 },
            { id: "b", type: "html", x: 0, y: 1, w: 12, html: "<p>y</p>", h: 99_999 },
        ]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).toMatchObject({ h: MIN_HOME_BLOCK_HEIGHT });
        expect(written[1]).toMatchObject({ h: MAX_HOME_BLOCK_HEIGHT });
    });

    it("n'écrit aucune hauteur quand le bloc n'en a pas", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x" }]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).not.toHaveProperty("h");
    });

    // Même tolérance que ci-dessus : une hauteur inexploitable retombe sur
    // « automatique » plutôt que de faire échouer toute la grille.
    it("ignore une hauteur qui n'est pas un nombre", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", h: "320" },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).not.toHaveProperty("h");
    });

    it("enregistre la feuille de style d'un bloc html, débarrassée de ses espaces", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", css: "  :scope { color: red; }  " },
        ]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).toMatchObject({ css: ":scope { color: red; }" });
    });

    it("n'écrit pas de css vide", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", css: "   " },
        ]);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).not.toHaveProperty("css");
    });

    it("refuse une feuille de style dépassant la limite, sans appeler Supabase", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            {
                id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>",
                css: "a".repeat(MAX_HOME_BLOCK_CSS_LENGTH + 1),
            },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un css qui n'est pas une chaîne, sans appeler Supabase", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", css: 42 },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
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

    // La hauteur explicite est réservée aux blocs à contenu libre : un widget
    // ou une bannière se dimensionne sur un contenu que l'application produit
    // elle-même. Une hauteur reçue là est ignorée plutôt que rejetée — rejeter
    // ferait échouer toute la sauvegarde d'un onglet resté ouvert sur une
    // version antérieure.
    it("ignore une hauteur portée par un widget ou une bannière — pas de h enregistré", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, h: 7, widgetId: "chatrooms" },
            { id: "b", type: "banner", x: 6, y: 0, w: 6, h: 320, banner: { title: "x" } },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).not.toHaveProperty("h");
        expect(written[1]).not.toHaveProperty("h");
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
        expect(res).toEqual({ ok: false, error: "saveFailed" });
    });

    it("enregistre un bloc bannière valide", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "banner", x: 0, y: 0, w: 12, banner: { title: "Bienvenue", text: "Salut" } },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0]).toMatchObject({ type: "banner", banner: { title: "Bienvenue", text: "Salut" } });
    });

    it("refuse un bloc bannière sans titre, texte ni image", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [{ id: "a", type: "banner", x: 0, y: 0, w: 12, banner: {} }]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("refuse un bloc bannière qui porte aussi un widgetId", async () => {
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "banner", x: 0, y: 0, w: 12, banner: { title: "x" }, widgetId: "chatrooms" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("écarte une URL de bouton non http(s) sans invalider tout le bloc bannière", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            {
                id: "a", type: "banner", x: 0, y: 0, w: 12,
                banner: { title: "x", buttonLabel: "Voir", buttonUrl: "javascript:alert(1)" },
            },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0].banner).not.toHaveProperty("buttonUrl");
        expect(written[0].banner).not.toHaveProperty("buttonLabel");
    });

    it("un bloc html sans card explicite est enregistré en carte (défaut préservant l'apparence historique)", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>" }]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0].card).toBe(true);
    });

    it("un bloc markdown sans card explicite est enregistré plein largeur (défaut préservant l'apparence historique)", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x" }]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0].card).toBe(false);
    });

    it("respecte card: false explicite sur un bloc html", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", card: false },
        ]);
        expect(res.ok).toBe(true);
        const written = mock.buildersFor("worlds")[0].update.mock.calls[0][0].home_grid;
        expect(written[0].card).toBe(false);
    });

    it("refuse deux blocs valides pris isolément mais qui se chevauchent sur une même ligne", async () => {
        // Régression (retour Copilot) : chaque bloc est validé indépendamment
        // (bornes, largeur…), mais rien n'empêchait deux blocs par ailleurs
        // valides de se recouvrir sur une même ligne (x=0,w=8 et x=6,w=6 se
        // chevauchent sur les colonnes 6 et 7) — un cas que l'éditeur ne peut
        // pas produire via moveBlock/resizeBlock, mais que le serveur doit
        // rejeter lui-même plutôt que de faire confiance au client.
        const mock = createSupabaseMock();
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 8, widgetId: "chatrooms" },
            { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "categories" },
        ]);
        expect(res.ok).toBe(false);
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("accepte deux blocs valides qui se touchent exactement sans se chevaucher", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "chatrooms" },
            { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "categories" },
        ]);
        expect(res.ok).toBe(true);
    });

    it("ignore les chevauchements entre blocs de lignes différentes", async () => {
        const mock = createSupabaseMock({ results: [{ error: null }] });
        use(mock);
        const res = await setWorldHomeGrid("w1", [
            { id: "a", type: "widget", x: 0, y: 0, w: 8, widgetId: "chatrooms" },
            { id: "b", type: "widget", x: 6, y: 1, w: 6, widgetId: "categories" },
        ]);
        expect(res.ok).toBe(true);
    });
});
