// Déplacement et agrandissement de la carte, en fonctions pures.
//
// Ces calculs vivaient dans le corps de `WorldMap`, mêlés à `useState` et à
// des lectures de `window` : invérifiables autrement qu'en ouvrant un
// navigateur. Les isoler ici sert deux fins — les tester (voir
// `__tests__/zoom.test.ts`), et les partager entre les trois gestes qui les
// réclament : la molette, le pincement à deux doigts et, plus tard, des
// boutons d'agrandissement.

/** État visuel de la carte : échelle, puis décalage en pixels du cadre. */
export type MapTransform = { scale: number; x: number; y: number };

/**
 * Ce qu'il faut connaître pour borner un déplacement : le cadre visible et
 * l'image telle qu'elle serait posée à l'échelle 1.
 */
export type MapBounds = {
  containerWidth: number;
  containerHeight: number;
  /** Taille de la carte une fois ajustée au cadre, à l'échelle 1. */
  imageWidth: number;
  imageHeight: number;
};

export type Point = { x: number; y: number };

/**
 * L'échelle 1 couvre le cadre ; au-delà, on entre dans la carte.
 *
 * L'échelle 1 est celle qui COUVRE le cadre : la carte ne peut jamais devenir
 * plus petite que lui, ni découvrir de fond derrière elle. Le plafond est à 6×,
 * de quoi lire un nom de hameau ; les pixels suivent, l'original — jusqu'à
 * 4096 px de large — remplaçant la vignette dès qu'elle ne suffit plus.
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
/** Un cran de molette, en proportion de l'échelle courante. */
export const ZOOM_STEP = 0.1;

export function clampScale(scale: number): number {
  // Un NaN traverserait `Math.max`/`Math.min` sans être borné ; les infinis,
  // eux, se bornent naturellement.
  if (Number.isNaN(scale)) return ZOOM_MIN;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
}

/**
 * Taille de la carte à l'échelle 1 : la plus petite qui COUVRE le cadre,
 * proportions gardées. Le débordement se parcourt en déplaçant la carte.
 *
 * La carte était posée en pleine largeur, hauteur libre : sur un cadre plus
 * haut que large — un téléphone — une carte large n'occupait qu'un bandeau, le
 * reste en fond noir. L'ajuster pour la montrer entière déplaçait simplement le
 * vide d'un axe à l'autre. Couvrir le supprime : il n'y a jamais de fond visible
 * derrière la carte, et comme c'est la taille de l'échelle 1, aucun
 * rétrécissement ne peut en faire apparaître.
 *
 * L'agrandissement est permis : une petite image occupe le cadre plutôt que d'y
 * flotter. C'est une carte, on veut la voir grande.
 */
export function coverSize(
  container: { width: number; height: number },
  natural: { width: number; height: number },
): { width: number; height: number } {
  if (container.width <= 0 || container.height <= 0) return { width: 0, height: 0 };
  if (natural.width <= 0 || natural.height <= 0) return { width: 0, height: 0 };
  const facteur = Math.max(container.width / natural.width, container.height / natural.height);
  return { width: natural.width * facteur, height: natural.height * facteur };
}

/**
 * Ramène le décalage dans les limites de la carte agrandie.
 *
 * Deux régimes selon l'axe. La carte y dépasse-t-elle du cadre — le cas normal,
 * l'échelle 1 le couvrant déjà ? Alors le décalage reste entre les deux bords,
 * pour qu'aucun vide n'apparaisse derrière. Y tient-elle entièrement ? Elle est
 * CENTRÉE plutôt que collée en haut à gauche. Ce second cas ne survient qu'en
 * transitoire — le cadre vient de s'agrandir, la carte n'a pas encore été
 * remesurée — mais sans lui la bande vide s'accumulerait d'un seul côté.
 */
export function clampOffset(
  x: number,
  y: number,
  scale: number,
  bounds: MapBounds,
): Point {
  return {
    x: clampAxis(x, bounds.imageWidth * scale, bounds.containerWidth),
    y: clampAxis(y, bounds.imageHeight * scale, bounds.containerHeight),
  };
}

function clampAxis(value: number, size: number, container: number): number {
  if (size <= container) return (container - size) / 2;
  return Math.max(container - size, Math.min(0, value));
}

/**
 * Agrandit autour d'un point du cadre, qui reste sous le curseur (ou entre les
 * doigts) : on retrouve le point de l'image visé, puis on décale pour le
 * remettre là où il était.
 */
export function applyZoom(
  current: MapTransform,
  targetScale: number,
  center: Point,
  bounds: MapBounds,
): MapTransform {
  const scale = clampScale(targetScale);
  if (scale === current.scale) return current;

  // Coordonnées du point visé dans l'image, avant agrandissement.
  const imageX = (center.x - current.x) / current.scale;
  const imageY = (center.y - current.y) / current.scale;

  const { x, y } = clampOffset(
    center.x - imageX * scale,
    center.y - imageY * scale,
    scale,
    bounds,
  );
  return { scale, x, y };
}

/**
 * Échelle visée par un cran de molette — vers le haut agrandit.
 *
 * Le pas est PROPORTIONNEL et non additif : sur une plage de 1 à 4, ajouter un
 * dixième à chaque cran demanderait trente tours de molette pour traverser, et
 * le même dixième paraîtrait brutal en bas de plage, dérisoire en haut. Un
 * facteur constant donne le même ressenti partout, en quinze crans.
 */
export function wheelScale(current: number, deltaY: number): number {
  const facteur = deltaY < 0 ? 1 + ZOOM_STEP : 1 / (1 + ZOOM_STEP);
  return clampScale(current * facteur);
}

/**
 * Vue par défaut : la carte couvre le cadre, centrée sur son débordement.
 *
 * La couverture est déjà acquise par `coverSize` — l'échelle reste donc à 1 — et
 * il ne reste qu'à répartir ce qui dépasse de part et d'autre. Posée à son coin
 * haut-gauche, une carte plus large que le cadre n'en montrerait que la moitié
 * ouest, et il faudrait la tirer à la main pour trouver son centre.
 */
export function initialTransform(bounds: MapBounds): MapTransform {
  if (bounds.imageWidth <= 0 || bounds.imageHeight <= 0) {
    return { scale: ZOOM_MIN, x: 0, y: 0 };
  }
  const couverture = Math.max(
    bounds.containerWidth / bounds.imageWidth,
    bounds.containerHeight / bounds.imageHeight,
  );
  const scale = clampScale(couverture);
  return {
    scale,
    ...clampOffset(
      (bounds.containerWidth - bounds.imageWidth * scale) / 2,
      (bounds.containerHeight - bounds.imageHeight * scale) / 2,
      scale,
      bounds,
    ),
  };
}

/**
 * Échelle visée par un pincement : le rapport des écartements, appliqué à
 * l'échelle du début du geste.
 *
 * Un écartement initial nul — deux doigts au même pixel — ne dit rien du geste
 * et rendrait une échelle infinie : on garde alors l'échelle de départ.
 */
export function pinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (startDistance <= 0) return clampScale(startScale);
  return clampScale((startScale * currentDistance) / startDistance);
}

/**
 * Transformation qui amène un point de la carte au centre du cadre, à échelle
 * inchangée.
 *
 * Sert à « aller à ce lieu » : trouver une épingle dans une liste ne sert à
 * rien si l'on doit ensuite la chercher des yeux. Le bornage s'applique — un
 * lieu près d'un bord ne se centre pas tout à fait, sous peine de découvrir le
 * fond derrière la carte.
 *
 * @param point position dans la carte, en pourcentage de ses dimensions
 */
export function centerOn(bounds: MapBounds, scale: number, point: Point): MapTransform {
  const x = bounds.containerWidth / 2 - (point.x / 100) * bounds.imageWidth * scale;
  const y = bounds.containerHeight / 2 - (point.y / 100) * bounds.imageHeight * scale;
  return { scale, ...clampOffset(x, y, scale, bounds) };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
