import { describe, it, expect } from "vitest";

import {
  wikiImagePath,
  extensionDepuisLeType,
  nomDeFichierUnique,
  nomDeFichierPourType,
  wikiImagePrefix,
  mapImagePath,
  mapImagePrefix,
  pinBannerPath,
  pinBannerPrefix,
} from "@/lib/storagePaths";

// ──────────────────────────────────────────────────────────────────────────
// Les sept espaces de stockage sont en lecture publique : un fichier est
// accessible à qui connaît son URL. Le nom de fichier EST le secret.
//
// Six chemins de téléversement le tiraient de `Math.random().toString(36)` —
// générateur non cryptographique, et longueur variable. Ces contrôles fixent
// ce qu'on attend d'un nom : imprévisible, de forme constante, et muet sur le
// fichier d'origine.
// ──────────────────────────────────────────────────────────────────────────

const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("nomDeFichierUnique", () => {
  it("produit un UUID suivi de l'extension", () => {
    const nom = nomDeFichierUnique("webp");
    const [base, ext] = [nom.slice(0, -5), nom.slice(-4)];
    expect(base).toMatch(FORME_UUID);
    expect(ext).toBe("webp");
  });

  it("ne répète jamais un nom", () => {
    const noms = new Set(Array.from({ length: 500 }, () => nomDeFichierUnique("webp")));
    expect(noms.size).toBe(500);
  });

  it("garde une longueur CONSTANTE", () => {
    // C'est le reproche principal fait à `Math.random().toString(36).slice(2)` :
    // `(0.5).toString(36)` vaut "0.i" et ne laisse qu'un caractère. Un nom court
    // se devine.
    const longueurs = new Set(
      Array.from({ length: 500 }, () => nomDeFichierUnique("webp").length),
    );
    expect(longueurs.size).toBe(1);
  });

  it("assainit l'extension, qui finit dans un chemin", () => {
    expect(nomDeFichierUnique(".PNG")).toMatch(/\.png$/);
    expect(nomDeFichierUnique("../../evil")).toMatch(/\.evil$/);
    expect(nomDeFichierUnique("jp g")).toMatch(/\.jpg$/);
    // Rien d'exploitable ne subsiste : ni point, ni barre oblique.
    expect(nomDeFichierUnique("../../x.sh").split("/")).toHaveLength(1);
    expect(nomDeFichierUnique("a/b").match(/\./g)).toHaveLength(1);
  });

  it("se rabat sur une extension neutre quand il ne reste rien", () => {
    expect(nomDeFichierUnique("...")).toMatch(/\.bin$/);
    expect(nomDeFichierUnique("")).toMatch(/\.bin$/);
  });
});

describe("extensionDepuisLeType", () => {
  it("couvre les types acceptés par les espaces de stockage", () => {
    // Relevé en base : webp, jpeg, png, gif et svg+xml, tous buckets confondus.
    expect(extensionDepuisLeType("image/webp")).toBe("webp");
    expect(extensionDepuisLeType("image/jpeg")).toBe("jpg");
    expect(extensionDepuisLeType("image/png")).toBe("png");
    expect(extensionDepuisLeType("image/gif")).toBe("gif");
    expect(extensionDepuisLeType("image/svg+xml")).toBe("svg");
  });

  it("ignore les paramètres et la casse du type", () => {
    expect(extensionDepuisLeType("IMAGE/JPEG")).toBe("jpg");
    expect(extensionDepuisLeType("image/jpeg; charset=binary")).toBe("jpg");
    expect(extensionDepuisLeType("  image/png  ")).toBe("png");
  });

  it("rend le repli pour un type inconnu ou absent", () => {
    expect(extensionDepuisLeType("application/pdf")).toBe("bin");
    expect(extensionDepuisLeType(undefined)).toBe("bin");
    expect(extensionDepuisLeType("")).toBe("bin");
    expect(extensionDepuisLeType("application/pdf", "png")).toBe("png");
  });
});

describe("nomDeFichierPourType", () => {
  it("déduit l'extension du contenu, pas du nom fourni", () => {
    // Le cas concret : une image téléversée en `.png` passe par `toWebP`. Le
    // contenu stocké est du WebP ; l'extension doit suivre le contenu.
    expect(nomDeFichierPourType("image/webp")).toMatch(/\.webp$/);
  });

  it("ne laisse rien filtrer du fichier d'origine", () => {
    // Un chemin de téléversement collait le nom d'origine à la fin. Il finit
    // dans une URL publique, et un nom de fichier est une donnée personnelle.
    const nom = nomDeFichierPourType("image/jpeg");
    expect(nom.toLowerCase()).not.toContain("julie");
    expect(nom).toMatch(new RegExp(`^${FORME_UUID.source.slice(1, -1)}\\.jpg$`));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Le rangement des images du wiki décide de ce qu'on saura effacer. Les
// policies de la migration 148 lisent ces mêmes segments : un chemin qui
// dérive ici, et l'envoi est refusé en production.
// ──────────────────────────────────────────────────────────────────────────

const MONDE = "11111111-1111-4111-8111-111111111111";
const PAGE = "22222222-2222-4222-8222-222222222222";

describe("wikiImagePrefix", () => {
  it("range par monde, puis par page", () => {
    expect(wikiImagePrefix(MONDE, PAGE)).toBe(`world-${MONDE}/page-${PAGE}`);
  });

  it("donne à deux pages du même monde deux dossiers distincts", () => {
    // C'est toute la raison d'être de ce rangement : supprimer une page ne
    // doit emporter que ses images.
    const autre = "33333333-3333-4333-8333-333333333333";
    expect(wikiImagePrefix(MONDE, PAGE)).not.toBe(wikiImagePrefix(MONDE, autre));
  });
});

describe("wikiImagePath", () => {
  it("pose le fichier dans le dossier de sa page", () => {
    const chemin = wikiImagePath(MONDE, PAGE, "image/webp");
    expect(chemin.startsWith(`${wikiImagePrefix(MONDE, PAGE)}/`)).toBe(true);
    expect(chemin.endsWith(".webp")).toBe(true);
  });

  it("satisfait le motif que la policy de la migration 148 exige", () => {
    const motif = new RegExp(
      String.raw`^world-[0-9a-fA-F-]{36}/page-[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.webp$`,
    );
    expect(wikiImagePath(MONDE, PAGE, "image/webp")).toMatch(motif);
  });

  it("ne garde rien du fichier d'origine, pas même deux fois le même nom", () => {
    expect(wikiImagePath(MONDE, PAGE, "image/webp"))
      .not.toBe(wikiImagePath(MONDE, PAGE, "image/webp"));
  });
});

describe("chemins des cartes et des lieux", () => {
  it("range l'image sous le préfixe de sa carte", () => {
    const chemin = mapImagePath("w1", "m1", "image/webp");
    expect(chemin.startsWith(mapImagePrefix("w1", "m1") + "/")).toBe(true);
    expect(chemin.endsWith(".webp")).toBe(true);
  });

  it("range la bannière sous le préfixe de son lieu", () => {
    const chemin = pinBannerPath("w1", "p1", "image/webp");
    expect(chemin.startsWith(pinBannerPrefix("w1", "p1") + "/")).toBe(true);
  });

  it("ne classe plus par téléverseur", () => {
    // L'ancien rangement — `user-<id>/world-<id>/…` — éparpillait les images
    // d'une même carte dans autant de dossiers qu'il y avait d'éditeurs.
    expect(mapImagePrefix("w1", "m1")).toBe("world-w1/map-m1");
    expect(pinBannerPrefix("w1", "p1")).toBe("world-w1/pin-p1");
  });

  it("tire un nom imprévisible, jamais deux fois le même", () => {
    // Ces espaces sont en lecture publique : le nom du fichier tient lieu de
    // secret. `map-${Date.now()}.webp` se devinait — treize chiffres dont on
    // connaît l'ordre de grandeur.
    const noms = new Set(
      Array.from({ length: 50 }, () => mapImagePath("w1", "m1", "image/webp")),
    );
    expect(noms.size).toBe(50);
    for (const nom of noms) expect(nom).not.toMatch(/\d{13}/);
  });
});

describe("les chemins que la policy de stockage accepte", () => {
  // Le motif de la migration 159, à la lettre. Le bucket `worlds` n'accepte
  // l'écriture sous `world-…` que pour des dossiers `map-<uuid>` ou
  // `pin-<uuid>` : un chemin qui ne lui répond pas est refusé par la base, et
  // l'interface n'affiche qu'un « Téléversement impossible ». Ce test fige le
  // contrat des deux côtés — le changer ici oblige à écrire une migration.
  const ACCEPTE_PAR_LA_POLICY =
    /^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/(map|pin)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\//;

  const MONDE = "f1e4d2c9-e56f-454a-bde2-8f9eade06e65";
  const CARTE = "11111111-1111-1111-1111-111111111111";

  it("l'image d'une carte", () => {
    expect(mapImagePath(MONDE, CARTE, "image/webp")).toMatch(ACCEPTE_PAR_LA_POLICY);
  });

  it("la bannière d'un lieu", () => {
    expect(pinBannerPath(MONDE, CARTE, "image/webp")).toMatch(ACCEPTE_PAR_LA_POLICY);
  });
});
