import type { Edge, Point } from "./geometry";

/**
 * Placement de la vue Constellations : chaque persona près de ceux avec qui il
 * a des relations (simulation de forces), attiré vers le centre de son îlot
 * (son joueur ou son groupe, selon le réglage « Regrouper »). Les personas
 * sans relation sont rangés à part, en rangées au bas du plateau.
 *
 * Même repère que les autres vues : un carré de 900 unités. Le calcul est
 * déterministe (positions de départ fixées, nombre de pas fixe) : la toile ne
 * bouge pas d'une visite à l'autre tant que les relations ne changent pas.
 *
 * `d3-force` n'est chargé qu'ici, à la demande : la vue Constellations est
 * la seule à en avoir besoin.
 */

export type ConstellationInput = {
  /** Personas à placer, dans l'ordre (déjà filtrés). */
  personaIds: string[];
  /** Liens visibles, déjà fusionnés. */
  edges: Edge[];
  /** Îlot de chaque persona : la clé de son joueur ou de son groupe. */
  clusterOf: (personaId: string) => string;
  /** Ordre des îlots (celui des arcs de la vue Cercle). */
  clusterOrder: string[];
  /** Clé de l'îlot « sans groupe », placé au milieu ; absent par joueur. */
  centralKey?: string;
};

export type ConstellationCluster = { key: string; ids: string[]; outline: string; labelAt: Point };

export type ConstellationLayout = {
  pos: Map<string, Point>;
  clusters: ConstellationCluster[];
  /** Personas sans aucune relation visible, rangés en bas. */
  isolated: string[];
  /** Hauteur (en unités) occupée par la rangée des isolés. */
  isolatedTop: number | null;
};

const SIZE = 900;
const MIN = 60;
const ISOLATED_PER_ROW = 12;
const ISOLATED_STEP_X = 64;
const ISOLATED_ROW_H = 54;
/** Marge autour des avatars d'un îlot, pour son contour. */
const HULL_PAD = 36;

/** Centre de chaque îlot : en ovale autour du milieu, l'îlot central au milieu. */
export function clusterCenters(order: string[], centralKey?: string, middle: Point = { x: SIZE / 2, y: 410 }): Map<string, Point> {
  // Plus il y a d'îlots, plus l'ovale s'élargit : ils ne se chevauchent pas.
  const around = order.filter((k) => k !== centralKey);
  const centers = new Map<string, Point>();
  if (centralKey && order.includes(centralKey)) centers.set(centralKey, middle);
  if (around.length === 1 && !centers.size) {
    centers.set(around[0], middle);
    return centers;
  }
  around.forEach((k, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / around.length;
    const spread = Math.min(1.15, 0.9 + around.length * 0.025);
    centers.set(k, { x: middle.x + 270 * spread * Math.cos(a), y: middle.y + 225 * spread * Math.sin(a) });
  });
  return centers;
}

/** Enveloppe convexe (chaîne monotone), sens trigonométrique. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Un contour fermé et arrondi passant par les sommets (Catmull-Rom → Bézier). */
export function smoothClosedPath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const f = (v: number) => Math.round(v * 10) / 10;
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return `${d} Z`;
}

/** Contour d'un îlot : l'enveloppe des avatars, élargie et arrondie. */
export function clusterOutline(points: Point[], pad = HULL_PAD): { outline: string; top: Point } {
  const padded = points.flatMap((p) =>
    Array.from({ length: 8 }, (_, i) => ({ x: p.x + pad * Math.cos((i * Math.PI) / 4), y: p.y + pad * Math.sin((i * Math.PI) / 4) })),
  );
  const hull = convexHull(padded);
  const top = hull.reduce((m, p) => (p.y < m.y ? p : m), hull[0] ?? { x: 0, y: 0 });
  return { outline: smoothClosedPath(hull), top };
}

/** Rangées des personas isolés, au bas du plateau. */
export function isolatedPositions(ids: string[]): { pos: Map<string, Point>; top: number | null } {
  const pos = new Map<string, Point>();
  if (!ids.length) return { pos, top: null };
  const rows = Math.ceil(ids.length / ISOLATED_PER_ROW);
  const bottom = SIZE - 44;
  ids.forEach((id, i) => {
    const row = Math.floor(i / ISOLATED_PER_ROW);
    const inRow = row === rows - 1 ? ids.length - row * ISOLATED_PER_ROW : ISOLATED_PER_ROW;
    const col = i % ISOLATED_PER_ROW;
    pos.set(id, {
      x: SIZE / 2 + (col - (inRow - 1) / 2) * ISOLATED_STEP_X,
      y: bottom - (rows - 1 - row) * ISOLATED_ROW_H,
    });
  });
  return { pos, top: bottom - (rows - 1) * ISOLATED_ROW_H - 34 };
}

export async function constellationLayout(input: ConstellationInput): Promise<ConstellationLayout> {
  const { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } = await import("d3-force");

  const linked = new Set<string>();
  for (const e of input.edges) { linked.add(e.from); linked.add(e.to); }
  const placed = input.personaIds.filter((id) => linked.has(id));
  const isolated = input.personaIds.filter((id) => !linked.has(id));
  const iso = isolatedPositions(isolated);
  const maxY = (iso.top ?? SIZE) - 30;

  const centers = clusterCenters(input.clusterOrder, input.centralKey);
  const middle = { x: SIZE / 2, y: 410 };
  type Node = { id: string; key: string; x: number; y: number };
  const nodes: Node[] = placed.map((id, i) => {
    const key = input.clusterOf(id);
    const c = centers.get(key) ?? middle;
    // Départ fixe, en petite spirale autour du centre de l'îlot.
    const a = i * 2.39996, r = 8 + 6 * Math.sqrt(i);
    return { id, key, x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
  const placedSet = new Set(placed);
  const links = input.edges
    .filter((e) => placedSet.has(e.from) && placedSet.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }));
  const central = (n: Node) => n.key === input.centralKey;
  // Par joueur, les relations traversent souvent les îlots : l'appartenance
  // l'emporte sur les liens, qui deviennent des traits entre îlots compacts.
  // Par groupe, les liens restent les plus forts : c'est ce qui rapproche.
  const byPlayer = !input.centralKey;
  const pull = byPlayer ? 0.9 : 0.2;
  const linkStrength = byPlayer ? 0.08 : 0.5;

  const sim = forceSimulation(nodes)
    .force("link", forceLink<Node, { source: string; target: string }>(links).id((d) => d.id).distance(52).strength(linkStrength))
    .force("charge", forceManyBody().strength(-120))
    .force("x", forceX<Node>((d) => (centers.get(d.key) ?? middle).x).strength((d) => (central(d) ? 0.06 : pull)))
    .force("y", forceY<Node>((d) => (centers.get(d.key) ?? middle).y).strength((d) => (central(d) ? 0.06 : pull)))
    .force("collide", forceCollide(26))
    .stop();
  for (let i = 0; i < 400; i++) sim.tick();

  const pos = new Map<string, Point>();
  for (const n of nodes) {
    pos.set(n.id, { x: Math.max(MIN, Math.min(SIZE - MIN, n.x)), y: Math.max(MIN, Math.min(maxY, n.y)) });
  }
  for (const [id, p] of iso.pos) pos.set(id, p);

  const clusters: ConstellationCluster[] = [];
  for (const key of input.clusterOrder) {
    // L'îlot central (« sans groupe ») n'a pas de contour : il passerait sous
    // tous les autres. Ses personas flottent simplement au milieu.
    if (key === input.centralKey) continue;
    const ids = placed.filter((id) => input.clusterOf(id) === key);
    if (!ids.length) continue;
    const { outline, top } = clusterOutline(ids.map((id) => pos.get(id)!));
    clusters.push({ key, ids, outline, labelAt: { x: top.x, y: top.y - 6 } });
  }

  return { pos, clusters, isolated, isolatedTop: iso.top };
}
