/**
 * Distingue une déconnexion voulue d'une session perdue.
 *
 * `onAuthStateChange` émet `SIGNED_OUT` dans les deux cas : la personne qui
 * clique « Se déconnecter » et le jeton qui expire produisent exactement le
 * même événement. Le surveillant de session affichait donc « Session
 * expirée — rechargez la page » à qui venait de partir de son plein gré, et
 * le message, posé sans durée, la suivait jusqu'à la page de connexion.
 *
 * Rien dans l'événement ne permet de trancher : seule l'application sait
 * qu'elle vient de demander la déconnexion. Elle le dit donc ici, juste avant
 * `signOut`, et le surveillant le consomme au premier `SIGNED_OUT`.
 *
 * Le drapeau s'efface aussi tout seul : si l'événement n'arrive pas — un
 * `signOut` qui échoue, un onglet fermé entre-temps — il ne doit pas rester à
 * masquer la PROCHAINE expiration, celle qu'il faut vraiment annoncer.
 */

/** Au-delà, on considère que le `SIGNED_OUT` attendu ne viendra plus. */
const OUBLI_MS = 10_000;

let annoncee = false;
let minuteur: ReturnType<typeof setTimeout> | null = null;

/** À appeler juste avant `auth.signOut()`. */
export function annoncerDeconnexion(): void {
  annoncee = true;
  if (minuteur) clearTimeout(minuteur);
  minuteur = setTimeout(oublier, OUBLI_MS);
}

/**
 * La déconnexion qui vient d'avoir lieu était-elle voulue ?
 *
 * Consomme la réponse : un second `SIGNED_OUT`, lui, sera bien une session
 * perdue.
 */
export function consommerDeconnexionAnnoncee(): boolean {
  const reponse = annoncee;
  oublier();
  return reponse;
}

function oublier(): void {
  annoncee = false;
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
}
