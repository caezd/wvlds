import { describe, it, expect } from "vitest";

import {
  buildCatalogExport,
  catalogItemMatches,
  clampQuantity,
  indexCatalog,
  isCatalogRarity,
  MAX_CATALOG_IMPORT_ITEMS,
  MAX_CATALOG_PROPERTIES,
  normalizeForSearch,
  parseCatalogImport,
  resolveCatalogEntry,
  sanitizeCatalogProperties,
} from "@/lib/worldCatalog";
import type { WorldCatalogItem } from "@/types/worlds";

// ──────────────────────────────────────────────────────────────────────────
// Le catalogue, côté calcul.
//
// Deux règles y portent tout le reste :
//
//   1. Le catalogue fait foi. Une fiche garde une copie du nom prise à
//      l'ajout ; elle ne sert plus qu'en dernier recours. Le bug d'origine :
//      renommer un objet ne changeait rien, le supprimer laissait des
//      fantômes indiscernables d'une entrée valide.
//   2. Rien de ce qui vient de l'extérieur n'est cru — ni le JSON d'un import,
//      ni les propriétés libres d'une écriture.
// ──────────────────────────────────────────────────────────────────────────

const item = (over: Partial<WorldCatalogItem> = {}): WorldCatalogItem => ({
  id: "c1",
  world_id: "w1",
  type: "inventory",
  name: "Épée longue",
  description: "Une lame d'acier",
  icon: "sword.svg",
  sort_index: 0,
  ...over,
});

// ── resolveCatalogEntry ───────────────────────────────────────────────────────

describe("resolveCatalogEntry", () => {
  it("sans catalog_id, la saisie libre EST la donnée", () => {
    const res = resolveCatalogEntry(
      { name: "Caillou", description: "Rond", icon: "rock.svg" },
      indexCatalog([item()]),
    );
    expect(res).toMatchObject({ name: "Caillou", description: "Rond", icon: "rock.svg", orphaned: false });
  });

  it("le catalogue l'emporte sur la copie rangée dans la fiche", () => {
    const res = resolveCatalogEntry(
      { catalog_id: "c1", name: "Ancien nom", description: "Ancienne description", icon: "old.svg" },
      indexCatalog([item({ name: "Épée longue", icon: "sword.svg", rarity: "rare" })]),
    );
    expect(res.name).toBe("Épée longue");
    expect(res.description).toBe("Une lame d'acier");
    expect(res.icon).toBe("sword.svg");
    expect(res.rarity).toBe("rare");
    expect(res.orphaned).toBe(false);
  });

  it("l'image du catalogue accompagne le reste", () => {
    const res = resolveCatalogEntry(
      { catalog_id: "c1" },
      indexCatalog([item({ image_url: "https://x/i.webp" })]),
    );
    expect(res.image_url).toBe("https://x/i.webp");
  });

  it("un objet absent du catalogue est marqué, et garde sa copie", () => {
    const res = resolveCatalogEntry({ catalog_id: "parti", name: "Relique" }, indexCatalog([item()]));
    expect(res).toMatchObject({ name: "Relique", orphaned: true });
  });

  // La nuance qui compte : ne pas savoir n'est pas savoir que non.
  it("sans catalogue chargé, rien n'est déclaré orphelin", () => {
    const res = resolveCatalogEntry({ catalog_id: "c1", name: "Copie" }, undefined);
    expect(res).toMatchObject({ name: "Copie", orphaned: false });
  });

  it("une entrée vide ne rend pas un nom indéfini", () => {
    expect(resolveCatalogEntry({}, undefined).name).toBe("");
  });
});

// ── clampQuantity ─────────────────────────────────────────────────────────────

describe("clampQuantity", () => {
  it("un objet non empilable vaut toujours un", () => {
    expect(clampQuantity(item({ stackable: false }), 7)).toBe(1);
  });

  it("le plafond de l'objet borne la quantité", () => {
    expect(clampQuantity(item({ max_quantity: 3 }), 9)).toBe(3);
    expect(clampQuantity(item({ max_quantity: 3 }), 2)).toBe(2);
  });

  it("jamais moins de un, jamais un nombre à virgule", () => {
    expect(clampQuantity(item(), 0)).toBe(1);
    expect(clampQuantity(item(), -4)).toBe(1);
    expect(clampQuantity(item(), 2.7)).toBe(2);
  });

  it("une saisie vide ou absurde retombe sur un", () => {
    expect(clampQuantity(item(), Number.NaN)).toBe(1);
    expect(clampQuantity(undefined, Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("sans objet connu, seule la borne basse s'applique", () => {
    expect(clampQuantity(undefined, 99)).toBe(99);
  });
});

// ── sanitizeCatalogProperties ────────────────────────────────────────────────

describe("sanitizeCatalogProperties", () => {
  it("élague les blancs et écarte les entrées incomplètes", () => {
    expect(
      sanitizeCatalogProperties([
        { label: "  Poids ", value: " 1 kg " },
        { label: "", value: "sans intitulé" },
        { label: "Sans valeur", value: "   " },
        { label: 42, value: "type inattendu" },
        "pas un objet",
        null,
      ]),
    ).toEqual([{ label: "Poids", value: "1 kg" }]);
  });

  it("plafonne le nombre d'entrées", () => {
    const trop = Array.from({ length: MAX_CATALOG_PROPERTIES + 10 }, (_, i) => ({
      label: `p${i}`,
      value: "x",
    }));
    expect(sanitizeCatalogProperties(trop)).toHaveLength(MAX_CATALOG_PROPERTIES);
  });

  it("tout ce qui n'est pas un tableau rend un tableau vide", () => {
    expect(sanitizeCatalogProperties({ label: "x", value: "y" })).toEqual([]);
    expect(sanitizeCatalogProperties(null)).toEqual([]);
    expect(sanitizeCatalogProperties("[]")).toEqual([]);
  });
});

// ── Recherche ─────────────────────────────────────────────────────────────────

describe("catalogItemMatches", () => {
  it("ignore les accents et la casse", () => {
    expect(catalogItemMatches(item(), normalizeForSearch("epee"))).toBe(true);
    expect(catalogItemMatches(item(), normalizeForSearch("ÉPÉE"))).toBe(true);
  });

  it("cherche aussi dans la description", () => {
    expect(catalogItemMatches(item(), normalizeForSearch("acier"))).toBe(true);
  });

  it("une requête vide laisse tout passer", () => {
    expect(catalogItemMatches(item(), "")).toBe(true);
  });

  it("ne trouve pas ce qui n'y est pas", () => {
    expect(catalogItemMatches(item(), normalizeForSearch("bouclier"))).toBe(false);
  });

  it("un objet sans description ne fait pas tomber la comparaison", () => {
    expect(catalogItemMatches(item({ description: null }), normalizeForSearch("acier"))).toBe(false);
  });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe("buildCatalogExport", () => {
  it("nomme la catégorie plutôt que de citer son identifiant", () => {
    const out = buildCatalogExport(
      "inventory",
      [item({ category_id: "cat1" })],
      new Map([["cat1", "Armes"]]),
    );
    expect(out.items[0].category).toBe("Armes");
  });

  // L'URL pointe le stockage du monde d'origine : la reprendre ailleurs
  // donnerait une image qui disparaît au premier ménage de ce monde-là.
  it("laisse l'image derrière elle", () => {
    const out = buildCatalogExport("inventory", [item({ image_url: "https://x/i.webp" })], new Map());
    expect(out.items[0]).not.toHaveProperty("image_url");
  });

  it("une catégorie inconnue de la table de noms ne casse rien", () => {
    const out = buildCatalogExport("skills", [item({ category_id: "absente" })], new Map());
    expect(out.items[0].category).toBeNull();
    expect(out.type).toBe("skills");
    expect(out.version).toBe(1);
  });
});

// ── Import ────────────────────────────────────────────────────────────────────

describe("parseCatalogImport", () => {
  const fichier = (payload: unknown) => JSON.stringify(payload);

  it("lit un export produit par l'application", () => {
    const source = buildCatalogExport("inventory", [item({ rarity: "epic", category_id: "cat1" })], new Map([["cat1", "Armes"]]));
    const res = parseCatalogImport(fichier(source), "inventory");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0]).toMatchObject({ name: "Épée longue", rarity: "epic", category: "Armes" });
  });

  it("refuse un JSON illisible", () => {
    expect(parseCatalogImport("{ pas du json", "inventory")).toEqual({ ok: false, reason: "json" });
  });

  it("refuse ce qui n'a pas la forme d'un catalogue", () => {
    expect(parseCatalogImport(fichier({ items: "pas un tableau" }), "inventory"))
      .toEqual({ ok: false, reason: "shape" });
    expect(parseCatalogImport(fichier([1, 2, 3]), "inventory"))
      .toEqual({ ok: false, reason: "shape" });
  });

  // Verser des compétences dans l'onglet des objets ne se rattrape pas après.
  it("refuse un fichier de l'autre onglet", () => {
    expect(parseCatalogImport(fichier({ type: "skills", items: [{ name: "x" }] }), "inventory"))
      .toEqual({ ok: false, reason: "type" });
  });

  it("accepte un fichier qui ne déclare pas son type", () => {
    const res = parseCatalogImport(fichier({ items: [{ name: "Épée" }] }), "inventory");
    expect(res.ok).toBe(true);
  });

  it("écarte les entrées inexploitables plutôt que de tout refuser", () => {
    const res = parseCatalogImport(
      fichier({ items: [{ name: "  " }, { nom: "clé inconnue" }, null, { name: "Bouclier" }] }),
      "inventory",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe("Bouclier");
  });

  it("ramène à la raison les valeurs douteuses", () => {
    const res = parseCatalogImport(
      fichier({
        items: [{
          name: "Fiole",
          rarity: "mythique",
          max_quantity: -3,
          properties: [{ label: "Poids", value: "1 kg" }, { label: "", value: "x" }],
        }],
      }),
      "inventory",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].rarity).toBeNull();
    expect(res.items[0].max_quantity).toBe(1);
    expect(res.items[0].properties).toEqual([{ label: "Poids", value: "1 kg" }]);
  });

  it("refuse un fichier sans aucune entrée exploitable", () => {
    expect(parseCatalogImport(fichier({ items: [] }), "inventory"))
      .toEqual({ ok: false, reason: "empty" });
  });

  it("plafonne le nombre d'entrées reprises", () => {
    const trop = Array.from({ length: MAX_CATALOG_IMPORT_ITEMS + 50 }, (_, i) => ({ name: `o${i}` }));
    const res = parseCatalogImport(fichier({ items: trop }), "inventory");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(MAX_CATALOG_IMPORT_ITEMS);
  });
});

// ── Raretés ───────────────────────────────────────────────────────────────────

describe("isCatalogRarity", () => {
  it("reconnaît les cinq degrés, et rien d'autre", () => {
    expect(isCatalogRarity("legendary")).toBe(true);
    expect(isCatalogRarity("mythique")).toBe(false);
    expect(isCatalogRarity(null)).toBe(false);
    expect(isCatalogRarity(3)).toBe(false);
  });
});

// ── indexCatalog ──────────────────────────────────────────────────────────────

describe("indexCatalog", () => {
  it("indexe par identifiant", () => {
    const map = indexCatalog([item({ id: "a" }), item({ id: "b" })]);
    expect(map.get("a")?.id).toBe("a");
    expect(map.size).toBe(2);
  });
});
