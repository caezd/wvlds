// Géométrie du plateau des relations : les personas sur un cercle (vue
// Cercle) ou autour de l'un d'eux (vue Centré), la fusion des relations en
// liens, le tracé des cordes et des flèches, et le placement des étiquettes.
//
// Tout se calcule dans un repère carré de 900 unités (le `viewBox` du SVG),
// centre en (450, 450). Les avatars et les textes, en HTML par-dessus, s'y
// placent en pourcentage (x / 9 %) et se dimensionnent en `cqw` — une unité
// de largeur du plateau vaut 9 unités du repère.
//
// Aucune dépendance à React : des données vers des nombres ou vers un chemin
// SVG. C'est ce qui les rend testables directement — voir
// `__tests__/geometry.test.ts`.

import type { CRelType, CRelation } from "./types";

/** Épaisseur du trait des relations (légende, dialogue). */
export const REL_W = 1.5;

// Dimensions de la carte d'un persona, dans la rangée mobile.
export const CW = 88;
export const CH = 88;

export type Point = { x: number; y: number };

// ─── Repère ───────────────────────────────────────────────────────────────────

/** Côté du repère du plateau. */
export const VIEW_SIZE = 900;
export const CENTER: Point = { x: VIEW_SIZE / 2, y: VIEW_SIZE / 2 };
/** Unités du repère par `cqw` (1 % de la largeur du plateau). */
export const UNITS_PER_CQW = VIEW_SIZE / 100;

const rad = (deg: number) => (deg * Math.PI) / 180;
const f1 = (n: number) => n.toFixed(1);

/** Le point à `r` du centre, dans la direction `angle` (degrés, 0 = droite, sens horaire). */
export function polar(angle: number, r: number, center: Point = CENTER): Point {
  return { x: center.x + r * Math.cos(rad(angle)), y: center.y + r * Math.sin(rad(angle)) };
}

/** Un point du repère, en pourcentage du plateau (pour le HTML posé dessus). */
export function toPercent(p: Point): { left: number; top: number } {
  return { left: (p.x / VIEW_SIZE) * 100, top: (p.y / VIEW_SIZE) * 100 };
}

/** Arc de cercle de `a0` à `a1` (degrés, sens horaire). */
export function arcPath(a0: number, a1: number, r: number, center: Point = CENTER): string {
  const p0 = polar(a0, r, center), p1 = polar(a1, r, center);
  return `M${f1(p0.x)} ${f1(p0.y)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(p1.x)} ${f1(p1.y)}`;
}

/** Point d'une courbe quadratique (a, contrôle c, b) au paramètre t. */
export function quadAt(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

// ─── Liens ────────────────────────────────────────────────────────────────────

/**
 * Un trait sur le plateau : une ou plusieurs relations entre deux mêmes
 * personas, d'un même type et d'un même statut. Les deux sens d'un même
 * type, ou un type réciproque, donnent un seul lien sans sens (`directed`
 * faux) ; deux sens de types différents donnent deux liens.
 */
export type Edge = {
  /** Identifiant stable : celui de la première relation. */
  id: string;
  from: string;
  to: string;
  type: string;
  pending: boolean;
  directed: boolean;
  rels: CRelation[];
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Fusionne les relations en liens (par paire, type et statut). */
export function mergeEdges(relations: CRelation[], typeMap: Map<string, Pick<CRelType, "mutual">>): Edge[] {
  const byKey = new Map<string, Edge>();
  const out: Edge[] = [];
  for (const r of relations) {
    const from = r.from_persona_id, to = r.to_persona_id;
    if (from === to) continue;
    const pending = r.status === "pending";
    const key = `${pairKey(from, to)}|${r.type}|${pending ? "p" : "a"}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.rels.push(r);
      if (existing.from !== from) existing.directed = false;
      continue;
    }
    const edge: Edge = { id: r.id, from, to, type: r.type, pending, directed: !typeMap.get(r.type)?.mutual, rels: [r] };
    byKey.set(key, edge);
    out.push(edge);
  }
  return out;
}

/**
 * La pointe d'un lien à sens unique : un triangle à base légèrement creusée,
 * posé sur `tip` et orienté selon la tangente (de `control` vers `tip`).
 */
export function arrowPath(tip: Point, control: Point, length: number, halfWidth: number): string {
  const tx = tip.x - control.x, ty = tip.y - control.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;
  const bx = tip.x - ux * length, by = tip.y - uy * length;
  return `M${f1(tip.x)} ${f1(tip.y)} L${f1(bx - uy * halfWidth)} ${f1(by + ux * halfWidth)} `
    + `Q${f1(tip.x - ux * length * 0.7)} ${f1(tip.y - uy * length * 0.7)} ${f1(bx + uy * halfWidth)} ${f1(by - ux * halfWidth)} Z`;
}

/**
 * Diviseur des flèches selon le zoom : le plateau grandit vraiment quand on
 * zoome, les traits non (`non-scaling-stroke`) ; une flèche qui suivrait le
 * plateau deviendrait énorme.
 */
export function arrowScale(zoom: number): number {
  return Math.max(1, zoom * 0.75);
}

/** Une courbe quadratique : son chemin SVG, ses extrémités et son point de contrôle. */
export type Curve = { d: string; a: Point; b: Point; c: Point };

function curve(a: Point, c: Point, b: Point): Curve {
  return { d: `M${f1(a.x)} ${f1(a.y)} Q${f1(c.x)} ${f1(c.y)} ${f1(b.x)} ${f1(b.y)}`, a, b, c };
}

// ─── Vue Cercle ───────────────────────────────────────────────────────────────

/** Rayon du cercle des personas. */
export const RING_R = 272;
/** Vide entre deux joueurs, en pas angulaires. */
export const PLAYER_GAP = 1.6;
/** Courbure des cordes : 0 droites, 1 toutes tirées au centre. */
export const DEFAULT_TENSION = 0.3;
/** Rayon du disque intérieur et des arcs des joueurs. */
export const ARC_R = RING_R - 19;
/** Rayon où les cordes s'arrêtent, au bord intérieur des avatars. */
export const CHORD_R = RING_R - 26;
/** Rayon où s'ancre le nom d'un joueur, tourné vers le centre. */
export const PLAYER_LABEL_R = RING_R - 36;
/** Les étiquettes de type restent en deçà, loin des avatars. */
export const RING_LABEL_MAX_R = RING_R - 60;

export type RingPlayer = { userId: string; personaIds: string[] };
export type RingArc = { userId: string; a0: number; a1: number; mid: number; personaIds: string[] };
export type RingLayout = {
  /** Pas angulaire entre deux personas voisins, en degrés. */
  step: number;
  /** Angle de chaque persona. */
  angles: Map<string, number>;
  arcs: RingArc[];
  /** Place disponible pour un avatar, en `cqw` (longueur d'arc d'un pas). */
  spacing: number;
};

/**
 * Tous les personas sur un seul cercle, joueur après joueur, un vide de
 * `PLAYER_GAP` pas entre deux joueurs. Le premier joueur commence en haut.
 */
export function ringLayout(players: RingPlayer[]): RingLayout {
  const shown = players.filter((p) => p.personaIds.length > 0);
  const count = shown.reduce((n, p) => n + p.personaIds.length, 0);
  const total = count + shown.length * PLAYER_GAP;
  const step = total > 0 ? 360 / total : 360;
  const angles = new Map<string, number>();
  const arcs: RingArc[] = [];
  let a = -90 + (step * PLAYER_GAP) / 2;
  for (const p of shown) {
    const a0 = a;
    p.personaIds.forEach((id, j) => angles.set(id, a0 + (j + 0.5) * step));
    a += p.personaIds.length * step;
    arcs.push({ userId: p.userId, a0, a1: a, mid: (a0 + a) / 2, personaIds: p.personaIds });
    a += PLAYER_GAP * step;
  }
  return { step, angles, arcs, spacing: (RING_R * rad(step)) / UNITS_PER_CQW };
}

/** L'arc d'un joueur, un peu en retrait de ses deux bouts. */
export function playerArcPath(arc: RingArc, step: number): string {
  return arcPath(arc.a0 + step * 0.15, arc.a1 - step * 0.15, ARC_R);
}

/**
 * La corde entre deux personas du cercle. Le point de contrôle est tiré
 * vers le centre d'autant plus que la corde est longue : les liens qui
 * traversent passent par le milieu, ceux entre voisins restent presque plats.
 */
export function chordCurve(angleA: number, angleB: number, tension = DEFAULT_TENSION, endR = CHORD_R): Curve {
  const a = polar(angleA, endR), b = polar(angleB, endR);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const k = tension + (1 - tension) * Math.pow(Math.max(0, 1 - length / (2 * endR)), 1.6) * 0.9;
  return curve(a, { x: CENTER.x + (mx - CENTER.x) * k, y: CENTER.y + (my - CENTER.y) * k }, b);
}

/**
 * Où poser l'étiquette du type d'une corde du persona mis en avant : aux
 * 7/10 en partant de lui, ramenée à l'intérieur du cercle.
 */
export function ringLabelPoint(c: Curve, fromFocused: boolean, maxR = RING_LABEL_MAX_R): Point {
  const p = quadAt(c.a, c.c, c.b, fromFocused ? 0.7 : 0.3);
  const r = Math.hypot(p.x - CENTER.x, p.y - CENTER.y);
  if (r <= maxR) return p;
  return { x: CENTER.x + ((p.x - CENTER.x) * maxR) / r, y: CENTER.y + ((p.y - CENTER.y) * maxR) / r };
}

/** Vrai si l'angle est sur la moitié droite du cercle (texte lu de gauche à droite). */
export function onRightHalf(angle: number): boolean {
  return Math.cos(rad(angle)) >= -1e-6;
}

/** Placement d'un texte orienté le long d'un rayon. */
export type RadialLabel = { left: number; top: number; transform: string; origin: string };

/**
 * Un texte qui part du cercle vers l'extérieur (nom d'un persona). À gauche,
 * il est retourné pour ne jamais se lire la tête en bas.
 */
export function outwardLabel(angle: number, r: number): RadialLabel {
  const { left, top } = toPercent(polar(angle, r));
  return onRightHalf(angle)
    ? { left, top, transform: `translate(0,-50%) rotate(${f1(angle)}deg)`, origin: "0 50%" }
    : { left, top, transform: `translate(-100%,-50%) rotate(${f1(angle + 180)}deg)`, origin: "100% 50%" };
}

/** Un texte qui s'achève sur le cercle en venant du centre (nom d'un joueur). */
export function inwardLabel(angle: number, r: number): RadialLabel {
  const { left, top } = toPercent(polar(angle, r));
  return onRightHalf(angle)
    ? { left, top, transform: `translate(-100%,-50%) rotate(${f1(angle)}deg)`, origin: "100% 50%" }
    : { left, top, transform: `translate(0,-50%) rotate(${f1(angle + 180)}deg)`, origin: "0 50%" };
}

// ─── Étiquettes de type ───────────────────────────────────────────────────────

/** Hauteur d'une ligne d'étiquettes, en unités du repère. */
export const LABEL_ROW = 22;

/** Largeur estimée d'une étiquette, en unités du repère. */
export function labelWidth(text: string): number {
  return text.length * 6.6 + 18;
}

/**
 * Écarte les étiquettes qui se chevauchent : de haut en bas, chacune
 * descend d'une ligne tant qu'elle recouvre une étiquette déjà posée.
 */
export function spreadLabels<T extends { x: number; y: number; w: number }>(labels: T[]): T[] {
  const placed: T[] = [];
  for (const l of [...labels].sort((p, q) => p.y - q.y)) {
    let y = l.y;
    let guard = 0;
    while (guard++ < 20 && placed.some((p) => Math.abs(p.x - l.x) < (p.w + l.w) / 2 + 4 && Math.abs(p.y - y) < LABEL_ROW)) y += LABEL_ROW;
    placed.push({ ...l, y });
  }
  return placed;
}

// ─── Vue Centré ───────────────────────────────────────────────────────────────

/** Diamètres des avatars de la vue Centré, en `cqw`. */
export const FOCUS_SIZES = { center: 8.5, direct: 4.4, directMany: 3.6, second: 2.5 } as const;
/** Rayon du second anneau. */
export const FOCUS_R2 = 380;

/** Rayon du premier anneau : plus large au-delà de dix voisins. */
export function focusR1(neighbors: number): number {
  return neighbors > 10 ? 245 : 215;
}

export type FocusLayout = {
  /** Relations directes, dans l'ordre des types. */
  neighbors: string[];
  /** Angle de chaque voisin direct. */
  angles: Map<string, number>;
  pos: Map<string, Point>;
  /** Diamètre de chaque avatar, en `cqw`. */
  sizes: Map<string, number>;
  /** Persona du second anneau → son voisin direct de rattachement. */
  parentOf: Map<string, string>;
  r1: number | null;
  r2: number | null;
  /** Liens retenus : du centre à un voisin, ou d'un voisin à son second degré. */
  edges: Array<{ edge: Edge; second: boolean }>;
};

/**
 * Un persona au centre, ses relations directes sur un premier anneau (triées
 * par type, à intervalles égaux depuis le haut), les relations de celles-ci
 * sur un second, en éventail autour de leur parent.
 *
 * @param typeOrder rang de chaque type, pour le tri du premier anneau
 */
export function focusLayout(focusId: string, edges: Edge[], typeOrder: ReadonlyMap<string, number>): FocusLayout {
  const other = (e: Edge, id: string) => (e.from === id ? e.to : e.to === id ? e.from : null);
  const rank = new Map<string, number>();
  const neighbors: string[] = [];
  for (const e of edges) {
    const o = other(e, focusId);
    if (!o || rank.has(o)) continue;
    rank.set(o, typeOrder.get(e.type) ?? 999);
    neighbors.push(o);
  }
  // Tri stable : à type égal, l'ordre des relations.
  neighbors.sort((a, b) => rank.get(a)! - rank.get(b)!);

  const pos = new Map<string, Point>([[focusId, CENTER]]);
  const sizes = new Map<string, number>([[focusId, FOCUS_SIZES.center]]);
  const angles = new Map<string, number>();
  const r1 = neighbors.length ? focusR1(neighbors.length) : null;
  neighbors.forEach((id, i) => {
    const a = -90 + (i * 360) / neighbors.length;
    angles.set(id, a);
    pos.set(id, polar(a, r1!));
    sizes.set(id, neighbors.length > 14 ? FOCUS_SIZES.directMany : FOCUS_SIZES.direct);
  });

  const parentOf = new Map<string, string>();
  for (const n of neighbors) {
    for (const e of edges) {
      const o = other(e, n);
      if (o && o !== focusId && !angles.has(o) && !parentOf.has(o)) parentOf.set(o, n);
    }
  }
  const byParent = new Map<string, string[]>();
  for (const [o, parent] of parentOf) byParent.set(parent, [...(byParent.get(parent) ?? []), o]);
  const widest = Math.max(1, ...[...byParent.values()].map((l) => l.length));
  const spread = Math.min(13, ((360 / Math.max(neighbors.length, 1)) * 0.8) / widest);
  for (const [parent, list] of byParent) {
    list.forEach((o, j) => {
      pos.set(o, polar(angles.get(parent)! + (j - (list.length - 1) / 2) * spread, FOCUS_R2));
      sizes.set(o, FOCUS_SIZES.second);
    });
  }

  const kept: FocusLayout["edges"] = [];
  for (const e of edges) {
    if (!pos.has(e.from) || !pos.has(e.to)) continue;
    if (e.from === focusId || e.to === focusId) kept.push({ edge: e, second: false });
    else if (parentOf.get(e.to) === e.from || parentOf.get(e.from) === e.to) kept.push({ edge: e, second: true });
  }
  return { neighbors, angles, pos, sizes, parentOf, r1, r2: parentOf.size ? FOCUS_R2 : null, edges: kept };
}

/**
 * Décalage de chaque lien d'une même paire, en fraction de sa longueur :
 * plusieurs types entre deux personas s'écartent en éventail (±0,2).
 */
export function pairOffsets(edges: Edge[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const e of edges) count.set(pairKey(e.from, e.to), (count.get(pairKey(e.from, e.to)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, number>();
  for (const e of edges) {
    const k = pairKey(e.from, e.to);
    const n = count.get(k)!;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    out.set(e.id, n > 1 ? (i - (n - 1) / 2) * 0.2 : 0);
  }
  return out;
}

/**
 * Une courbe entre deux avatars ronds, arrêtée à leur bord.
 *
 * @param ra, rb  distance au centre de chaque avatar où le trait s'arrête
 * @param offset  écart du point de contrôle, en fraction de la longueur
 */
export function focusCurve(a: Point, b: Point, ra: number, rb: number, offset: number): Curve {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const c = { x: (a.x + b.x) / 2 - uy * len * offset, y: (a.y + b.y) / 2 + ux * len * offset };
  const n1 = Math.hypot(c.x - a.x, c.y - a.y) || 1;
  const n2 = Math.hypot(b.x - c.x, b.y - c.y) || 1;
  return curve(
    { x: a.x + ((c.x - a.x) / n1) * ra, y: a.y + ((c.y - a.y) / n1) * ra },
    c,
    { x: b.x - ((b.x - c.x) / n2) * rb, y: b.y - ((b.y - c.y) / n2) * rb },
  );
}

/** Rayon, en unités du repère, d'un avatar de `size` cqw, plus une marge. */
export function avatarRadius(size: number, margin = 5): number {
  return (size * UNITS_PER_CQW) / 2 + margin;
}

/**
 * Où poser l'étiquette de type d'un lien du centre : sur la bande libre
 * entre le centre et le premier anneau — plus loin du centre quand le voisin
 * est en dessous (35°–145°), pour laisser lisible le nom du persona central.
 */
export function focusLabelPoint(c: Curve, fromCenter: boolean, neighborAngle: number, r1: number): Point {
  const an = ((neighborAngle % 360) + 360) % 360;
  const cr = avatarRadius(FOCUS_SIZES.center, 0);
  const rr = cr + (an >= 35 && an <= 145 ? 0.66 : 0.42) * (r1 - cr);
  const tc = Math.min(0.9, Math.max(0.1, rr / r1));
  return quadAt(c.a, c.c, c.b, fromCenter ? tc : 1 - tc);
}
