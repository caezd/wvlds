/**
 * Déplacements dans l'arbre des pages d'un wiki, en pur calcul.
 *
 * Le glisser-déposer produit deux gestes distincts, que l'interface ne
 * distingue pas mais que la donnée, elle, doit distinguer :
 *
 *  - **déposer SUR un dossier** : la page y entre, en dernier ;
 *  - **déposer SUR une page** : la page vient prendre sa place, et adopte au
 *    passage le parent de celle-ci — c'est ainsi qu'on ressort une page d'un
 *    dossier, en la lâchant sur une page du niveau visé.
 *
 * Sortir d'un dossier était impossible : le réordonnancement refusait tout
 * couple de parents différents, et le dépôt sur dossier ne savait que faire
 * entrer. Il ne restait aucun geste pour faire sortir.
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
): EcritureDeplacement[] | null {
  if (activeId === overId) return null;

  const active = pages.find(p => p.id === activeId);
  const over = pages.find(p => p.id === overId);
  if (!active || !over) return null;

  // ── Déposer SUR un dossier : y entrer, en dernier ────────────────────
  if (over.is_folder && over.id !== active.parent_id) {
    if (estDansLeSousArbre(pages, active.id, over.id)) return null;
    return [{
      id: active.id,
      parent_id: over.id,
      sort_index: enfantsDe(pages, over.id).length,
    }];
  }

  // ── Déposer SUR une page : prendre sa place, chez son parent ─────────
  const parentCible = over.parent_id;
  if (estDansLeSousArbre(pages, active.id, parentCible)) return null;

  const arrivee = enfantsDe(pages, parentCible).filter(p => p.id !== active.id);
  const place = arrivee.findIndex(p => p.id === over.id);
  if (place === -1) return null;

  // Descendre dans sa propre liste : la place visée est celle que la page
  // occupera APRÈS son retrait, d'où l'insertion après la cible.
  const memeListe = active.parent_id === parentCible;
  const depart = memeListe
    ? enfantsDe(pages, parentCible).findIndex(p => p.id === active.id)
    : -1;
  const index = memeListe && depart < place ? place + 1 : place;

  arrivee.splice(index, 0, { ...active, parent_id: parentCible });

  return arrivee
    .map((p, i) => ({ id: p.id, parent_id: parentCible, sort_index: i }))
    // Rien à écrire pour une page qui ne bouge ni de parent ni de rang.
    .filter(e => {
      const avant = pages.find(p => p.id === e.id)!;
      return avant.parent_id !== e.parent_id || avant.sort_index !== e.sort_index;
    });
}
