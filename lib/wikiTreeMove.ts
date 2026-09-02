/**
 * Déplacements dans l'arbre des pages d'un wiki, en pur calcul.
 *
 * ── Trois zones par ligne, et non une ──
 * Une ligne de dossier signifiait « dedans » sur toute sa hauteur : impossible
 * de poser une page juste au-dessus ou juste au-dessous d'un dossier sans
 * qu'elle y entre. La ligne se découpe donc en trois — une bande au sommet
 * pour passer devant, une au pied pour passer derrière, tout le reste pour
 * entrer. Une page, elle, n'a que deux zones : elle n'accueille rien.
 *
 * ── En pixels, et non en fractions ──
 * Les bandes valaient le quart de la hauteur survolée. Or la boîte d'un
 * dossier déplié contient tout son contenu : son quart bas tombait vingt
 * lignes plus bas que son intitulé, hors d'atteinte. Une bande de huit pixels
 * garde la même taille quelle que soit la boîte — et c'est la bande « après »
 * d'un dossier déplié, inatteignable par construction, que remplace la zone
 * dédiée posée sous son contenu.
 *
 * C'est la position du pointeur qui décide, et non la direction du geste :
 * l'écart montré et l'écriture obéissent ainsi à la même donnée, celle que
 * l'utilisateur voit.
 */

/** Ce dont un déplacement a besoin de savoir sur une page. */
export type TreeNode = {
  id: string;
  parent_id: string | null;
  is_folder: boolean;
  sort_index: number;
};

/** Une ligne à écrire : la page déplacée, et celles qu'elle décale. */
export type MoveWrite = {
  id: string;
  parent_id: string | null;
  sort_index: number;
};

/** Où la page se posera par rapport à la ligne survolée. */
export type Zone = "before" | "after" | "inside";

/** Hauteur des bandes « devant » et « derrière » d'un dossier, en pixels. */
export const EDGE_BAND = 8;

/**
 * Zone visée d'après la position du pointeur dans la boîte survolée.
 *
 * `y` se compte depuis le sommet de la boîte. Il n'est pas borné par
 * l'appelant : le pointeur sort de la cible entre deux mesures.
 */
export function targetZone(y: number, height: number, targetIsFolder: boolean): Zone {
  if (!targetIsFolder) return y < height / 2 ? "before" : "after";
  if (y < EDGE_BAND) return "before";
  if (y > height - EDGE_BAND) return "after";
  return "inside";
}

/**
 * La bande posée sous le contenu d'un dossier déplié, et qui vaut « après lui ».
 *
 * Elle a son propre identifiant de dépôt : la boîte du dossier englobe son
 * contenu, une page lâchée au bas de cette boîte tombe donc sur le dernier
 * enfant — c'est-à-dire DANS le dossier. La bande est en dehors de cette
 * boîte, elle seule peut dire « à côté ».
 */
const AFTER_PREFIX = "apres:";
export const afterZoneId = (pageId: string) => `${AFTER_PREFIX}${pageId}`;
export const pageOfAfterZone = (dropId: string) =>
  dropId.startsWith(AFTER_PREFIX) ? dropId.slice(AFTER_PREFIX.length) : null;

/** Enfants directs, dans l'ordre d'affichage. */
function childrenOfNode(pages: TreeNode[], parentId: string | null): TreeNode[] {
  return pages
    .filter(p => p.parent_id === parentId)
    .sort((a, b) => a.sort_index - b.sort_index);
}

/**
 * `cible` est-elle dans le sous-arbre de `racine` (ou `racine` elle-même) ?
 *
 * Déplacer un dossier dans sa propre descendance le détacherait de l'arbre
 * avec tout ce qu'il contient : plus aucun chemin n'y mènerait depuis la
 * racine, et rien à l'écran ne dirait où c'est parti.
 */
export function isInSubtree(
  pages: TreeNode[],
  rootId: string,
  targetId: string | null,
): boolean {
  let current = targetId;
  // L'arbre peut être incohérent le temps d'un rendu ; la borne évite qu'une
  // boucle de parenté fasse tourner cette recherche sans fin.
  for (let guard = 0; current !== null && guard <= pages.length; guard++) {
    if (current === rootId) return true;
    current = pages.find(p => p.id === current)?.parent_id ?? null;
  }
  return false;
}

/** Déplacement d'un cran, tel qu'un menu peut le proposer. */
export type MoveCommand = "monter" | "descendre" | "sortir" | "entrer";

/**
 * Déplacements praticables sur cette page, sans souris.
 *
 * Le glisser-déposer est le seul chemin vers l'ordre des pages, et il demande
 * un pointeur : au clavier, à la voix, ou sur un écran tactile où le geste
 * échoue, l'arbre est figé. Ces quatre commandes couvrent les mêmes
 * déplacements, un cran à la fois, et rendent chacune la cible et la zone que
 * `planMove` attend — la même règle sert donc les deux chemins.
 *
 * Une commande absente de la réponse n'a pas de sens ici : rien au-dessus,
 * rien en dessous, pas de dossier où entrer, pas de parent d'où sortir.
 */
export function keyboardMoves(
  pages: TreeNode[],
  pageId: string,
): Partial<Record<MoveCommand, { targetId: string; zone: Zone }>> {
  const page = pages.find(p => p.id === pageId);
  if (!page) return {};

  const siblings = childrenOfNode(pages, page.parent_id);
  const rank = siblings.findIndex(p => p.id === pageId);
  const previous = rank > 0 ? siblings[rank - 1] : null;
  const next = rank !== -1 && rank < siblings.length - 1 ? siblings[rank + 1] : null;

  return {
    ...(previous && { monter: { targetId: previous.id, zone: "before" as const } }),
    ...(next && { descendre: { targetId: next.id, zone: "after" as const } }),
    // Sortir, c'est se poser juste après le dossier qui nous contenait — là où
    // le regard s'attend à retrouver ce qu'on vient d'en tirer.
    ...(page.parent_id && { sortir: { targetId: page.parent_id, zone: "after" as const } }),
    // Entrer, c'est rejoindre le dossier qu'on a juste au-dessus. Le suivant
    // ferait aussi bien, mais il faut choisir : celui d'au-dessus se lit dans
    // le sens de la lecture, et c'est celui qu'on vient de dépasser.
    ...(previous?.is_folder && { entrer: { targetId: previous.id, zone: "inside" as const } }),
  };
}

/**
 * Écritures d'un glisser-déposer, ou `null` quand le geste ne change rien.
 *
 * Ne renumérote que la liste d'arrivée. Celle de départ garde un trou dans ses
 * `sort_index`, ce qui est sans conséquence : seul l'ordre relatif compte, et
 * la renuméroter doublerait les écritures pour rien.
 */
export function planMove(
  pages: TreeNode[],
  activeId: string,
  overId: string,
  zone: Zone,
): MoveWrite[] | null {
  if (activeId === overId) return null;

  const active = pages.find(p => p.id === activeId);
  const over = pages.find(p => p.id === overId);
  if (!active || !over) return null;

  // ── Entrer dans un dossier : s'y poser en dernier ────────────────────
  if (zone === "inside") {
    if (!over.is_folder) return null;
    if (isInSubtree(pages, active.id, over.id)) return null;
    if (over.id === active.parent_id) return null;
    return [{
      id: active.id,
      parent_id: over.id,
      sort_index: childrenOfNode(pages, over.id).length,
    }];
  }

  // ── Se poser devant ou derrière la ligne visée, chez son parent ──────
  const targetParent = over.parent_id;
  if (isInSubtree(pages, active.id, targetParent)) return null;

  const destination = childrenOfNode(pages, targetParent).filter(p => p.id !== active.id);
  const slot = destination.findIndex(p => p.id === over.id);
  if (slot === -1) return null;

  destination.splice(zone === "after" ? slot + 1 : slot, 0, {
    ...active,
    parent_id: targetParent,
  });

  return destination
    .map((p, i) => ({ id: p.id, parent_id: targetParent, sort_index: i }))
    // Rien à écrire pour une page qui ne bouge ni de parent ni de rang.
    .filter(e => {
      const before = pages.find(p => p.id === e.id)!;
      return before.parent_id !== e.parent_id || before.sort_index !== e.sort_index;
    });
}
