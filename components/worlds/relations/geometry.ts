// Géométrie du canevas de relations : disposition des cartes dans un bloc, et
// tracé des flèches entre elles.
//
// Aucune dépendance à React : ce sont des fonctions pures, du nombre vers du
// nombre ou vers un chemin SVG. C'est ce qui les rend testables directement —
// voir `__tests__/geometry.test.ts`.

/** Épaisseur du trait des relations. */
export const REL_W = 1.5;

// SVG marker id — uuid peut contenir des tirets, on les retire
export function mid(id: string) { return `arr-${id.replaceAll("-", "")}`; }

// ─── Disposition ──────────────────────────────────────────────────────────────

export const CW = 88;   // largeur d'une carte
export const CH = 88;   // hauteur d'une carte
export const CG = 6;    // écart entre deux cartes
export const BP = 10;   // marge intérieure du bloc
export const HH = 42;   // hauteur de l'en-tête du bloc
export const NC = 2;    // nombre de colonnes
const BB = 2;           // épaisseur de la bordure du bloc (border-2)
export const BLOCK_W = NC * CW + (NC - 1) * CG + BP * 2;

export function blockH(n: number) {
  const rows = Math.max(1, Math.ceil(n / NC));
  return HH + BP + rows * CH + (rows > 1 ? (rows - 1) * CG : 0) + BP;
}

// La grille a paddingTop:0 et le bloc a border-2 → y = BB+HH (pas de BP en haut)
export function cardTL(i: number) {
  return { x: BB + BP + (i % NC) * (CW + CG), y: BB + HH + Math.floor(i / NC) * (CH + CG) };
}

export function cardCtr(bx: number, by: number, i: number) {
  const p = cardTL(i);
  return { x: bx + p.x + CW / 2, y: by + p.y + CH / 2 };
}

// ─── Tracé des flèches ────────────────────────────────────────────────────────

function edgePoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { x: cx, y: cy - h / 2, nx: 0, ny: -1 };
  const hw = w / 2, hh = h / 2;
  const sx = hw / Math.abs(dx), sy = hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  const onV = s === sx;
  return { x: cx + dx * s, y: cy + dy * s, nx: onV ? Math.sign(dx) : 0, ny: onV ? 0 : Math.sign(dy) };
}

export function bezierD(ax: number, ay: number, bx: number, by: number) {
  const A = edgePoint(ax, ay, CW, CH, bx, by);
  const B = edgePoint(bx, by, CW, CH, ax, ay);
  const ofs = Math.max(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.38);
  return `M ${A.x} ${A.y} C ${A.x + A.nx * ofs} ${A.y + A.ny * ofs} ${B.x + B.nx * ofs} ${B.y + B.ny * ofs} ${B.x} ${B.y}`;
}

export function bezierMidPt(ax: number, ay: number, bx: number, by: number) {
  const A = edgePoint(ax, ay, CW, CH, bx, by);
  const B = edgePoint(bx, by, CW, CH, ax, ay);
  const ofs = Math.max(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.38);
  const cx1 = A.x + A.nx * ofs, cy1 = A.y + A.ny * ofs;
  const cx2 = B.x + B.nx * ofs, cy2 = B.y + B.ny * ofs;
  return {
    x: 0.125 * A.x + 0.375 * cx1 + 0.375 * cx2 + 0.125 * B.x,
    y: 0.125 * A.y + 0.375 * cy1 + 0.375 * cy2 + 0.125 * B.y,
  };
}

// Découpe un bezier cubique en deux demi-chemins à t=0.5 (De Casteljau)
export function splitBezierHalves(ax: number, ay: number, bx: number, by: number) {
  const A = edgePoint(ax, ay, CW, CH, bx, by);
  const B = edgePoint(bx, by, CW, CH, ax, ay);
  const ofs = Math.max(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.38);
  const cx1 = A.x + A.nx * ofs, cy1 = A.y + A.ny * ofs;
  const cx2 = B.x + B.nx * ofs, cy2 = B.y + B.ny * ofs;
  const m1x = (A.x + cx1) / 2, m1y = (A.y + cy1) / 2;
  const m2x = (cx1 + cx2) / 2, m2y = (cy1 + cy2) / 2;
  const m3x = (cx2 + B.x) / 2, m3y = (cy2 + B.y) / 2;
  const m4x = (m1x + m2x) / 2, m4y = (m1y + m2y) / 2;
  const m5x = (m2x + m3x) / 2, m5y = (m2y + m3y) / 2;
  const mx = (m4x + m5x) / 2, my = (m4y + m5y) / 2;
  return {
    dMidToA: `M ${mx} ${my} C ${m4x} ${m4y} ${m1x} ${m1y} ${A.x} ${A.y}`,
    dMidToB: `M ${mx} ${my} C ${m5x} ${m5y} ${m3x} ${m3y} ${B.x} ${B.y}`,
    mid: { x: mx, y: my },
  };
}
