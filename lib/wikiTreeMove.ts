/**
 * Déplacements dans l'arbre des pages d'un wiki, en pur calcul.
 *
 * ── Trois zones par ligne, et non une ──
 * Une ligne de dossier signifiait « dedans » sur toute sa hauteur : impossible
 * de poser une page juste au-dessus ou juste au-dessous d'un dossier sans
 * qu'elle y entre. La ligne se découpe donc en trois — le quart haut pour
 * passer devant, le quart bas pour passer derrière, la moitié du milieu pour
 * entrer. Une page, elle, n'a que deux zones : elle n'accueille rien.
 *
 * C'est la position du pointeur dans la ligne qui décide, et non la direction
 * du geste : le trait affiché et l'écriture obéissent ainsi à la même donnée,
 * celle que l'utilisateur voit.
 */

/** Ce dont un déplacement a besoin de savoir sur une page. */
export type NoeudArbre = {
  id: string;
  parent_id: string | null;
  is_folder: boolean;
  sort_index: number;
};

/** Une ligne à écrire : la page déplacée, et celles qu'elle décale. */
export type EcritureDeplacement = {
  id: string;
  parent_id: string | null;
  sort_index: number;
};

/** Où la page se posera par rapport à la ligne survolée. */
export type Zone = "avant" | "apres" | "dans";

/** Part de la hauteur d'un dossier réservée à ses bords. */
const BORD_DOSSIER = 0.25;

/**
 * Zone visée d'après la position du pointeur dans la ligne survolée.
 *
 * `ratio` vaut 0 au sommet de la ligne et 1 à son pied. Il n'est pas borné par
 * l'appelant : la page glissée est plus haute qu'une ligne, son centre sort
 * donc régulièrement de la cible.
 */
export function zoneVisee(ratio: number, cibleEstDossier: boolean): Zone {
  if (!cibleEstDossier) return ratio < 0.5 ? "avant" : "apres";
  if (ratio < BORD_DOSSIER) return "avant";
  if (ratio > 1 - BORD_DOSSIER) return "apres";
  return "dans";
}

/** Enfants directs, dans l'ordre d'affichage. */
function enfantsDe(pages: NoeudArbre[], parentId: string | null): NoeudArbre[] {
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
export function estDansLeSousArbre(
  pages: NoeudArbre[],
  racineId: string,
  cibleId: string | null,
): boolean {
  let courant = cibleId;
  // L'arbre peut être incohérent le temps d'un rendu ; la borne évite qu'une
  // boucle de parenté fasse tourner cette recherche sans fin.
  for (let garde = 0; courant !== null && garde <= pages.length; garde++) {
    if (courant === racineId) return true;
    courant = pages.find(p => p.id === courant)?.parent_id ?? null;
  }
  return false;
}

/**
 * Écritures d'un glisser-déposer, ou `null` quand le geste ne change rien.
 *
 * Ne renumérote que la liste d'arrivée. Celle de départ garde un trou dans ses
 * `sort_index`, ce qui est sans conséquence : seul l'ordre relatif compte, et
 * la renuméroter doublerait les écritures pour rien.
 */
export function planifierDeplacement(
  pages: NoeudArbre[],
  activeId: string,
  overId: string,
  zone: Zone,
): EcritureDeplacement[] | null {
  if (activeId === overId) return null;

  const active = pages.find(p => p.id === activeId);
  const over = pages.find(p => p.id === overId);
  if (!active || !over) return null;

  // ── Entrer dans un dossier : s'y poser en dernier ────────────────────
  if (zone === "dans") {
    if (!over.is_folder) return null;
    if (estDansLeSousArbre(pages, active.id, over.id)) return null;
    if (over.id === active.parent_id) return null;
    return [{
      id: active.id,
      parent_id: over.id,
      sort_index: enfantsDe(pages, over.id).length,
    }];
  }

  // ── Se poser devant ou derrière la ligne visée, chez son parent ──────
  const parentCible = over.parent_id;
  if (estDansLeSousArbre(pages, active.id, parentCible)) return null;

  const arrivee = enfantsDe(pages, parentCible).filter(p => p.id !== active.id);
  const place = arrivee.findIndex(p => p.id === over.id);
  if (place === -1) return null;

  arrivee.splice(zone === "apres" ? place + 1 : place, 0, {
    ...active,
    parent_id: parentCible,
  });

  return arrivee
    .map((p, i) => ({ id: p.id, parent_id: parentCible, sort_index: i }))
    // Rien à écrire pour une page qui ne bouge ni de parent ni de rang.
    .filter(e => {
      const avant = pages.find(p => p.id === e.id)!;
      return avant.parent_id !== e.parent_id || avant.sort_index !== e.sort_index;
    });
}
