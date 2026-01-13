// components/personas/avatar/avatarCatalog.ts
// Structure attendue:
// public/avatar_parts/<layer>/<files>.png
// + texture forcée (non-retirable):
// public/avatar_parts/fx/texture_paper.png

export const AVATAR_SIZE = 600 as const;

export type VariantType = "color" | "other";

export type AvatarVariant = {
  key: string;
  label: string;
  type?: VariantType;
  hex?: string;
  path: string; // relatif au layer
  thumbPath?: string;
};

export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export type DependsOnSource = "partId" | "variantKey";

export type DependsOnSpec = {
  /**
   * Catégorie/layer à observer (ex: "body")
   */
  category: string;

  /**
   * - "partId": dépend du part sélectionné (ex: body_01 vs body_02)
   * - "variantKey": dépend de la variante choisie
   */
  source: DependsOnSource;

  /**
   * Key utilisée si la dépendance n'est pas trouvée.
   * - si source="partId": un partId (ex: "body_01")
   * - si source="variantKey": une variantKey
   */
  fallbackKey?: string;
};

export type AssetsForKey = {
  path?: string; // optionnel: asset simple
  thumbPath?: string;
  variants?: AvatarVariant[];
  defaultVariantKey?: string;
};

export type AvatarPartRef = {
  id: string;
  category: string; // layer (dossier)
  label: string;

  z?: number;
  byDefault?: boolean;

  // image simple
  path?: string;
  thumbPath?: string;

  // variantes
  variants?: AvatarVariant[];
  defaultVariantKey?: string;

  // rendu
  alpha?: number; // 0..1
  blendMode?: BlendMode; // default: source-over

  /**
   * Synchronisation de variantes.
   * - variantGroup: “fait partie” d’un groupe (ex: skin)
   * - drivesVariantGroup: “pilote” le groupe; un changement de variante sur ce part
   *   doit se propager aux autres parts du même variantGroup.
   */
  variantGroup?: string;
  drivesVariantGroup?: string;

  /**
   * Part "dépendant": son asset/variantes viennent d'un mapping selon une autre sélection
   * (ex: vêtements spécifiques au body).
   */
  dependsOn?: DependsOnSpec;
  assetsByKey?: Record<string, AssetsForKey>;
};

export type AvatarCategory = {
  key: string; // layer folder
  label: string;
  zBase: number;
  allowNone?: boolean;
  multi?: boolean;

  // UI / comportement
  hidden?: boolean; // n’apparaît pas dans les tabs
  alwaysOn?: boolean; // appliqué même si config vide/manipulée

  /**
   * (Optionnel) thumbnail pour remplacer le label de l'onglet (UI)
   * Ex: "thumbs/body.png" (relatif au dossier du layer) ou un path absolu "/..."
   */
  tabThumbPath?: string;
};

export function assetUrl(layer: string, path: string): string {
  if (!path) return "";
  if (path.startsWith("/")) return path;
  return `/avatar_parts/${layer}/${path}`.replace(/\/{2,}/g, "/");
}

/**
 * -----------------------------
 * Helpers (catalog "fonctionnel")
 * -----------------------------
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function makeSimpleSeries(opts: {
  category: string;
  prefix: string;
  labelPrefix: string;
  from: number;
  to: number;
  byDefault?: boolean;
  pathForId?: (id: string) => string;
}): AvatarPartRef[] {
  const pathForId = opts.pathForId ?? ((id) => `${id}.png`);

  return range(opts.from, opts.to).map((i) => {
    const id = `${opts.prefix}_${pad2(i)}`;
    return {
      id,
      category: opts.category,
      label: `${opts.labelPrefix} ${pad2(i)}`,
      byDefault: opts.byDefault ?? false,
      path: pathForId(id),
    };
  });
}

function makeSeriesWithVariants(opts: {
  category: string;
  prefix: string;
  labelPrefix: string;
  from: number;
  to: number;

  // ✅ nouveau: force tous les items à être default ou aucun
  byDefault?: boolean;

  // existant: 1 seul item par défaut (si byDefault n’est pas défini)
  byDefaultIndex?: number;

  variantGroup?: string | null;
  drivesVariantGroup?: string | null;

  z?: number;
  alpha?: number;
  blendMode?: BlendMode;

  defaultVariantKey?: string;
  variantsForId: (id: string, index: number) => AvatarVariant[];
}): AvatarPartRef[] {
  const out: AvatarPartRef[] = [];

  for (let i = opts.from; i <= opts.to; i++) {
    const id = `${opts.prefix}_${pad2(i)}`;

    const computedByDefault =
      typeof opts.byDefault === "boolean"
        ? opts.byDefault
        : i === (opts.byDefaultIndex ?? opts.from);

    out.push({
      id,
      category: opts.category,
      label: `${opts.labelPrefix} ${pad2(i)}`,
      byDefault: computedByDefault,

      variants: opts.variantsForId(id, i),
      defaultVariantKey: opts.defaultVariantKey,

      variantGroup: opts.variantGroup ?? null,
      drivesVariantGroup: opts.drivesVariantGroup ?? null,

      z: opts.z,
      alpha: opts.alpha,
      blendMode: opts.blendMode,
    });
  }

  return out;
}

type NamedColor = {
  key: string;
  label: string;
  hex: string;
};

function makeNamedColorVariants(
  items: readonly NamedColor[],
  pathForKey: (key: string) => string,
): AvatarVariant[] {
  return items.map((it) => ({
    key: it.key,
    label: it.label,
    type: "color",
    hex: it.hex,
    path: pathForKey(it.key),
  }));
}

function makeVariants(
  partId: string,
  keys: readonly string[],
): AvatarVariant[] {
  // NOTE: "#5D5E7" est actuellement utilisé comme "base" (fichier *_base.png) dans ton dataset.
  // Si tu changes la base, ajuste SKIN_BASE_KEY ci-dessous.
  const SKIN_BASE_KEY = "#5D5E70";

  return keys.map((key) => {
    const hex = key.startsWith("#") ? key : `#${key}`;
    const fileKey = key.replace(/^#/, "");
    const path =
      key === SKIN_BASE_KEY ? `${partId}_base.png` : `${partId}_${fileKey}.png`;

    return {
      key,
      label: key,
      type: "color",
      hex,
      path,
    };
  });
}

/**
 * -----------------------------
 * Données (tables)
 * -----------------------------
 */

const CATALOG = {
  bg: {
    from: 1,
    to: 21,
  },

  palettes: {
    // Palette partagée body/head (et éventuellement ears/forehead/etc.)
    skinKeys: [
      "A4A4A4",
      "5D5E70",
      "B886BD",
      "6C804F",
      "99AC68",
      "598792",
      "83AFBB",
      "9F4B4B",
      "B87A5F",
      "8D5C42",
      "81523D",
      "544131",
      "CE976C",
      "DFA797",
      "EABBA2",
      "EED4C8",
      "F6E5E3",
    ],
    body_accent: ["80513C", "A56B51", "D99D82"],

    blush: ["9D614F", "D27C6E", "F2A1A1"],
    blemishes: ["A5654E", "C37E65", "DFAFA5"],
    freckles: ["81533E", "AE705E", "D2947E"],

    lips: ["9D5844", "58423D", "C5928D", "E38874", "FFFFFF"],

    eyes: [
      "2F2929",
      "5B8A9F",
      "676464",
      "689488",
      "718744",
      "77875D",
      "7E5230",
      "806D50",
      "8D69A7",
      "A93F3F",
      "CA9A4D",
      "E5DADA",
    ],

    frame: ["444444", "FFFFFF"],

    hair: [
      "252323",
      "3A7E5D",
      "3D477E",
      "523932",
      "55A1A9",
      "7C4C32",
      "7C6CF2",
      "807777",
      "8B5830",
      "91AB4E",
      "9C5189",
      "9FCA8A",
      "AD0FDB",
      "ADEE6F",
      "B23E39",
      "BCFF7F",
      "C59156",
      "C9743C",
      "D33B3B",
      "DCAAFF",
      "DD6161",
      "DFB158",
      "E78282",
      "E97A4D",
      "EAFCE2",
      "ECD7CE",
      "F0318E",
    ],

    face_hair: ["2B2525", "744729", "A5622F", "C79654", "E8E1DD", "F27F7F"],

    horns: [
      "544131",
      "5D5E70",
      "814F3D",
      "83AFBB",
      "8D5C42",
      "99AC68",
      "9F4B4B",
      "B87A5F",
      "B886BD",
      "C57F6B",
      "CA9D79",
      "DFA797",
      "EABBA2",
      "EED4C8",
      "F6E5E3",
    ],

    glasses: ["242222", "983838", "CCCACA", "D9A146"],

    outfit01_body01: [
      {
        key: "red",
        label: "Rouge",
        hex: "#EF4444",
        path: "outfit/outfit_01/body_01/red.png",
        thumbPath: "outfit/outfit_01/body_01/thumbs/red.png",
      },
      {
        key: "blue",
        label: "Bleu",
        hex: "#3B82F6",
        path: "outfit/outfit_01/body_01/blue.png",
        thumbPath: "outfit/outfit_01/body_01/thumbs/blue.png",
      },
      {
        key: "black",
        label: "Noir",
        hex: "#111827",
        path: "outfit/outfit_01/body_01/black.png",
        thumbPath: "outfit/outfit_01/body_01/thumbs/black.png",
      },
    ],
  },
} as const;

/**
 * Remplace les keys/labels selon TES dossiers réels.
 * Ici je garde un exemple numérique + j’ajoute fx (caché).
 */

export const avatarParts: AvatarPartRef[] = [
  // ---- Fond (série)
  ...makeSimpleSeries({
    category: "bg",
    prefix: "bg",
    labelPrefix: "Fond",
    from: CATALOG.bg.from,
    to: CATALOG.bg.to,
    byDefault: true,
    pathForId: (id) => `${id}.png`,
  }),

  ...makeSeriesWithVariants({
    category: "frame",
    prefix: "frame",
    labelPrefix: "Cadre",
    from: 1,
    byDefault: false,
    to: 6,
    defaultVariantKey: "FFFFFF",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.frame),
  }),

  // ---- Skin
  {
    id: "body_01",
    category: "body",
    label: "Corps 01",
    byDefault: true,
    drivesVariantGroup: "skin",
    variantGroup: "skin",
    variants: makeVariants("body_01", CATALOG.palettes.skinKeys),
    defaultVariantKey: "5D5E70",
  },

  // ---- Body freckles
  ...makeSeriesWithVariants({
    category: "body_accent",
    prefix: "body_accent",
    labelPrefix: "Peau (décoration)",
    from: 1,
    to: 6,
    byDefault: false,
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.body_accent),
  }),

  // ---- Breast
  ...makeSimpleSeries({
    category: "breast",
    prefix: "breast",
    labelPrefix: "Poitrine",
    from: 1,
    to: 2,
    byDefault: false,
    pathForId: (id) => `${id}.png`,
  }),

  // ---- Tête
  ...makeSeriesWithVariants({
    category: "head",
    prefix: "head",
    labelPrefix: "Tête",
    from: 1,
    to: 3,
    drivesVariantGroup: "skin",
    variantGroup: "skin",
    defaultVariantKey: "5D5E70",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.skinKeys),
  }),

  // ---- Nose
  ...makeSimpleSeries({
    category: "nose",
    prefix: "nose",
    labelPrefix: "Nez",
    from: 1,
    to: 21,
    byDefault: true,
    pathForId: (id) => `${id}.png`,
  }),

  // ---- Face lines
  ...makeSimpleSeries({
    category: "face_line",
    prefix: "face_line",
    labelPrefix: "Lignes",
    from: 1,
    to: 7,
    byDefault: false,
    pathForId: (id) => `${id}.png`,
  }),

  // ---- Bouche
  ...makeSeriesWithVariants({
    category: "lips",
    prefix: "lips",
    labelPrefix: "Lèvres",
    from: 1,
    to: 21,
    byDefaultIndex: 1,
    defaultVariantKey: "FFFFFF",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.lips),
  }),

  // ---- Ears
  ...makeSeriesWithVariants({
    category: "ear",
    prefix: "ear",
    labelPrefix: "Oreilles",
    from: 1,
    to: 4,
    byDefaultIndex: 1,
    drivesVariantGroup: "skin",
    variantGroup: "skin",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.skinKeys),
    defaultVariantKey: "5D5E70",
  }),

  // ---- Blush
  ...makeSeriesWithVariants({
    category: "blush",
    prefix: "blush",
    labelPrefix: "Rougeur",
    from: 1,
    to: 4,
    byDefault: false,
    defaultVariantKey: "F2A1A1",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.blush),
  }),

  // ---- Face blemishes (palette nommée)
  ...makeSeriesWithVariants({
    category: "face_blemishes",
    prefix: "face_blemishes",
    labelPrefix: "Décoloration",
    from: 1,
    to: 2,
    byDefault: false,
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.blemishes),
  }),

  // ---- Décoloration
  ...makeSeriesWithVariants({
    category: "face_freckles",
    prefix: "face_blemishes",
    labelPrefix: "Décoloration",
    from: 3,
    to: 10,
    byDefault: false,
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.freckles),
  }),

  // ---- Yeux (palette nommée)
  ...makeSeriesWithVariants({
    category: "eyes",
    prefix: "eyes",
    labelPrefix: "Yeux",
    from: 1,
    to: 14,
    byDefaultIndex: 1,
    defaultVariantKey: "676464",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.eyes),
  }),

  // ---- Pupilles
  ...makeSimpleSeries({
    category: "pupil",
    prefix: "pupil",
    labelPrefix: "Pupille",
    from: 1,
    to: 2,
    byDefault: true,
    pathForId: (id) => `${id}.png`,
  }),

  // ---- Hair Front (palette nommée)
  ...makeSeriesWithVariants({
    category: "hair_front",
    prefix: "hair_front",
    labelPrefix: "Cheveux devant",
    from: 1,
    to: 68,
    byDefaultIndex: 1,
    defaultVariantKey: "676464",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.hair),
  }),

  ...makeSeriesWithVariants({
    category: "face_hair",
    prefix: "face_hair",
    labelPrefix: "BArbe",
    from: 1,
    to: 19,
    byDefault: false,
    defaultVariantKey: "2B2525",
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.face_hair),
  }),

  // ---- Horns
  ...makeSeriesWithVariants({
    category: "horns",
    prefix: "horns",
    labelPrefix: "Oreilles",
    from: 1,
    to: 4,
    byDefault: false,
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.horns),
  }),

  // ---- Glasses
  ...makeSeriesWithVariants({
    category: "glasses",
    prefix: "glasses",
    labelPrefix: "Lunettes",
    from: 1,
    to: 9,
    byDefault: false,
    variantsForId: (id) => makeVariants(id, CATALOG.palettes.glasses),
  }),

  // ---- Vêtement dépendant du body (assetsByKey)
  {
    id: "outfit_01",
    category: "07",
    label: "Vêtement 01",
    dependsOn: {
      category: "body",
      source: "partId",
      fallbackKey: "body_01",
    },
    assetsByKey: {
      body_01: {
        defaultVariantKey: "red",
        variants: CATALOG.palettes.outfit01_body01.map((v) => ({
          key: v.key,
          label: v.label,
          type: "color",
          hex: v.hex,
          path: v.path,
          thumbPath: v.thumbPath,
        })),
      },
    },
  },

  {
    id: "acc_hat_01",
    category: "09",
    label: "Chapeau 01",
    path: "hat_01.png",
  },

  // ---- TEXTURE FORCÉE (non retirable, overlay alpha 1)
  {
    id: "armpit",
    category: "armpit",
    label: "armpit",
    byDefault: true,
    path: "armpit_01.png",
    alpha: 1,
    z: 0,
  },

  // ---- TEXTURE FORCÉE (non retirable, overlay alpha 0.8)
  {
    id: "fx_texture_paper",
    category: "fx",
    label: "Texture Paper",
    byDefault: true,
    path: "texture_paper.png",
    alpha: 0.8,
    z: 0,
  },
];

export const avatarCategories: AvatarCategory[] = [
  {
    key: "body",
    label: "Corps",
    zBase: 100,
    allowNone: false,
    tabThumbPath: "/avatar_tabs/body.png",
  },
  {
    key: "body_accent",
    label: "Corps décoration",
    zBase: 100,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/body_freckles.png",
  },
  {
    key: "breast",
    label: "Poitrine",
    zBase: 150,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/breast.png",
  },
  {
    key: "head",
    label: "Visage",
    zBase: 200,
    allowNone: false,
    tabThumbPath: "/avatar_tabs/head.png",
  },
  {
    key: "ear",
    label: "Oreilles",
    zBase: 100,
    allowNone: false,
    tabThumbPath: "/avatar_tabs/ears.png",
  },
  {
    key: "blush",
    label: "Rougeurs",
    zBase: 201,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/blush.png",
  },
  {
    key: "face_blemishes",
    multi: true,
    label: "Décoloration",
    zBase: 201,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/face_blemish.png",
  },
  {
    key: "face_freckles",
    multi: true,
    label: "Taches de rousseur",
    zBase: 201,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/face_freckles.png",
  },
  {
    key: "lips",
    label: "Lèvres",
    zBase: 205,
    allowNone: false,
    tabThumbPath: "/avatar_tabs/lips.png",
  },
  {
    key: "eyes",
    label: "Yeux",
    zBase: 210,
    allowNone: false,
    tabThumbPath: "/avatar_tabs/eyes.png",
  },
  {
    key: "pupil",
    label: "Pupilles",
    zBase: 211,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/pupil.png",
  },
  {
    key: "nose",
    label: "Nez",
    zBase: 220,
    allowNone: false,
    tabThumbPath: "/avatar_tabs/nose.png",
  },
  {
    key: "face_line",
    label: "Lignes",
    zBase: 225,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/face_lines.png",
  },
  {
    key: "hair_front",
    label: "Cheveux",
    zBase: 300,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/hair_front.png",
  },
  {
    key: "face_hair",
    label: "Barbe",
    zBase: 299,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/face_hair.png",
  },
  {
    key: "animal_ears",
    label: "Oreilles d'animaux",
    zBase: 310,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/animal_ears.png",
  },
  {
    key: "horns",
    label: "Cornes",
    zBase: 310,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/horns.png",
  },
  {
    key: "glasses",
    label: "Lunettes",
    zBase: 600,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/glasses.png",
  },

  {
    key: "bg_accent",
    label: "Décoration",
    zBase: 605,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/accents.png",
  },

  {
    key: "bg",
    label: "Fond",
    zBase: 0,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/bg.png",
  },
  {
    key: "frame",
    label: "Cadre",
    zBase: 10,
    allowNone: true,
    tabThumbPath: "/avatar_tabs/frame.png",
  },

  // Texture forcée (cachée + alwaysOn)
  {
    key: "armpit",
    label: "armpit",
    zBase: 9_999,
    allowNone: false,
    hidden: true,
    alwaysOn: true,
  },
  {
    key: "fx",
    label: "FX",
    zBase: 10_000,
    allowNone: false,
    hidden: true,
    alwaysOn: true,
  },
];
