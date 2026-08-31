/**
 * Diffère une action jusqu'à ce que le menu qui la déclenche soit refermé.
 *
 * ── Le problème ──────────────────────────────────────────────
 * Radix rend `document.body` inerte (`pointer-events: none`) tant qu'une
 * couche modale est ouverte, et ne le restaure que lorsque la DERNIÈRE se
 * retire. Un élément de menu — déroulant ou contextuel — qui ouvre une boîte
 * de dialogue fait donc cohabiter deux couches : le menu qui se ferme, et le
 * dialogue qui s'ouvre. Le décompte se désynchronise, la restauration n'a
 * jamais lieu, et plus RIEN n'est cliquable dans l'application : il faut
 * recharger la page.
 *
 * Signalé à l'usage sur la suppression d'un commentaire de wiki, puis
 * reproduit à l'identique sur douze autres écrans. Le symptôme était d'abord
 * passé pour un artefact d'environnement de test, où il se manifeste aussi.
 *
 * ── Le remède ────────────────────────────────────────────────
 * Rendre la main au navigateur avant d'ouvrir le dialogue : le menu a fini de
 * se fermer, sa couche est bien retirée, et le dialogue devient la première —
 * donc celle qui mémorise l'état à restaurer.
 *
 * ── Quand s'en servir ────────────────────────────────────────
 * Sur tout `onSelect`/`onClick` d'un élément de menu qui ouvre une couche
 * modale : Dialog, AlertDialog, Sheet, Drawer.
 *
 * Inutile — et donc à éviter — pour ce qui ne fait qu'écrire dans l'état local
 * (renommer sur place, changer d'onglet), naviguer, ou copier : sans seconde
 * couche modale, il n'y a rien à désynchroniser, et différer sans raison rend
 * le code plus difficile à suivre.
 */
export function afterMenuClose(action: () => void): () => void {
  return () => { setTimeout(action, 0); };
}
