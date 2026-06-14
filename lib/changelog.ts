export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-06",
    tag: "Mobile",
    text: "Correctif mobile : la carte principale a désormais 8 px d'espace sur tous les côtés (haut compris). Le composeur de message s'ajuste à la largeur du conteneur au lieu d'utiliser un padding fixe de 40 px.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Correctif : l'avatar d'un persona se met à jour en temps réel dans les messages du chatroom dès qu'il est modifié, sans recharger la page. Le sélecteur de persona dans le composeur recharge aussi la liste à chaque ouverture.",
  },
  {
    date: "2026-06",
    tag: "Technique",
    text: "Nettoyage complet de la base de code : zéro erreur ESLint et TypeScript, build de production fiabilisé. La page « Mot de passe oublié » affiche désormais une confirmation après l'envoi du lien de réinitialisation.",
  },
  {
    date: "2026-06",
    tag: "Admin",
    text: "Nouveaux flags dans la section Fonctionnalités : « Créer une partie » masque le composeur de création dans les mondes, « Poster un message » masque le composeur dans les salles.",
  },
  {
    date: "2026-06",
    tag: "Admin",
    text: "Nouvelle section Fonctionnalités dans le panneau d'administration : activer ou désactiver le constructeur d'avatar, la boutique, les réactions emoji, les médias dans les salles et la création de mondes publics — sans déploiement. Les modifications sont effectives immédiatement pour tous les utilisateurs dès le prochain chargement de page.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Le bouton Inviter a été déplacé dans l'entête du panneau Membres : owners et admins peuvent désormais gérer les invitations directement depuis la liste des membres, sans quitter la vue.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Nouveau panneau Membres dans le rail latéral des mondes et des salles : liste les membres triés par rôle, avec leur avatar de profil et un stack des personas qu'ils ont utilisés pour écrire dans le monde.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Paramètres d'une salle repensés : zone de bannière avec glisser-déposer (recadrage intégré), icône modifiable via dropdown, sauvegarde automatique au changement, et footer avec bouton de suppression ghost aligné sur le style des paramètres de monde.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "L'indicateur « … est en train d'écrire » a été déplacé dans une languette intégrée au composer : elle se déplie depuis l'arrière du champ de saisie avec une animation de translation quand quelqu'un écrit, puis se replie derrière lorsqu'il s'arrête.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Le sélecteur de réaction d'un message utilise désormais un véritable picker d'emojis complet (en français, style Twitter, thème sombre, aperçu + choix de teinte de peau) habillé aux couleurs des dropdowns de l'app. Les réactions ajoutées s'affichent avec le rendu Twitter pour rester cohérentes avec le picker.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Les réactions d'un message s'affichent désormais juste en dessous des boutons réagir/éditer/supprimer, alignées avec la date et l'heure du message, au lieu d'être collées à gauche de ces boutons.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Toutes les images uploadées (avatars, bannières, icônes de monde, images de section, médias de chatroom) sont automatiquement converties en WebP avant l'envoi — réduction de 40 à 60 % du poids par rapport aux PNG/JPEG originaux.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Les images sont désormais servies en version redimensionnée via la transformation d'images Supabase, réduisant le poids des pages et accélérant le chargement.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Ajout de la gestion des sections dans la sheet d'édition : renommer, réordonner (gauche/droite) et supprimer une section via le bouton « … » en bout d'onglet actif.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Nouveau type de champ « Grille d'images » dans les sections d'un personnage : permet d'uploader plusieurs images affichées en grille, aussi bien en édition qu'en lecture.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Il est maintenant possible de supprimer ses propres messages dans un chatroom : une icône corbeille apparaît au survol, avec un dialog de confirmation avant suppression définitive.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Page d'un monde réorganisée : la barre d'onglets est désormais intégrée en bas de la bannière, avec un onglet « Home » (icône) qui affiche les conversations (composer + parties). Les autres onglets affichent leur contenu sous la bannière.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Le composer pour démarrer une nouvelle partie depuis la page d'un monde réutilise désormais le composer complet des chatrooms (sélecteur de persona, blocs dé/ellipse, dialogues en bulles, images collées, Markdown). Toute amélioration du composer profite aux deux endroits.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Nouveau type de champ « Séparateur » dans les sections d'un personnage : insère un fin trait horizontal pour aérer et structurer le contenu.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Les onglets de sections d'un personnage adoptent le style segmenté standard de l'application (comme les onglets Avatar/Cosmétiques), aussi bien à l'édition que dans la fiche de visualisation.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Nouveau type de champ « Stats » dans les sections d'un personnage : ajoutez des valeurs chiffrées avec une unité (AGI, INT, ANS, cm, kg…), affichées ensemble en petites cartes dans une grille qui s'adapte à la largeur.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Ouvrir un panneau latéral fait désormais reculer et flouter légèrement le reste de l'application pour mettre le contenu en avant. Les panneaux empilés (ex. l'avatar par-dessus l'édition d'un personnage) laissent dépasser celui du dessous pour montrer la profondeur.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Édition d'apparence repensée : les menus (Avatar/Cosmétiques et Générateur/Upload/URL) sont alignés en sous-menu, l'avatar actuel reste visible en tout temps dans l'en-tête et, sur grand écran, un grand aperçu s'affiche à côté du panneau.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Sur la grille des personnages, le bouton d'édition apparaît désormais dans le coin supérieur droit au survol, et l'état vide reprend le style des autres pages.",
  },
  {
    date: "2026-06",
    tag: "Boutique",
    text: "Boutique remaniée : le solde s'affiche dans l'en-tête avec l'emoji 🪙, le prix figure sur chaque article, et la mise en page est alignée sur le reste de l'application.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Sidebar repensée : boutons en pilule avec bordure au survol, bouton « Nouveau monde » ancré en bas avec le quota en bout de ligne, et largeur de contenu uniformisée entre les pages.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Sidebar réduite enrichie : l'icône personnalisée d'un monde s'affiche dans le rail (avec repli sur l'initiale colorée), et l'avatar du profil avec sa pastille de présence est désormais ancré tout en bas du rail.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "La section « Partagés avec moi » de la sidebar est masquée lorsqu'aucun monde n'est partagé.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Connexion plus fiable : les identifiants remplis automatiquement par le navigateur sont désormais pris en compte dès la première tentative, et un message d'erreur explicite s'affiche en cas d'échec.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Confirmation d'inscription et invitations validées côté serveur : le lien du courriel fonctionne maintenant depuis n'importe quel appareil ou navigateur. Les sessions expirées redirigent automatiquement vers la page de connexion.",
  },
  {
    date: "2026-06",
    tag: "Comptes",
    text: "Nouveau flux d'invitation par courriel : les utilisateurs invités reçoivent un courriel stylisé à la charte Wvlds et sont guidés vers un écran de création de mot de passe et de nom d'utilisateur.",
  },
  {
    date: "2026-06",
    tag: "Comptes",
    text: "Un nom d'utilisateur est maintenant obligatoire. Un dialogue bloquant s'affiche lors de la première connexion tant qu'aucun pseudo n'est défini.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "La suppression d'un compte depuis l'administration ne bloque plus. Les personnages et mondes de l'utilisateur sont conservés (soft-delete) et l'historique des messages reste intact.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Nouveaux composants de jeu dans le composer : lancé de dés avec formule personnalisable, préréglages, étiquette optionnelle et détection critique/fumble ; ellipse de temps avec séparateur stylisé, modifiable et supprimable.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Mode Dialogues en bulles : les paragraphes entre guillemets sont rendus en bulles de dialogue avec incise inline. Couleur personnalisable via un color picker avec aperçu en temps réel.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Zone de saisie remplacée par un éditeur de blocs (contenteditable) : indicateurs de paragraphes visuels à gauche, détection automatique des blocs au collage depuis un message rendu.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Dropdown de navigation entre salons amélioré. Pastille de présence tristate sur les avatars.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Images dans le composer : coller une image affiche un aperçu avec bouton de suppression. Les images sont uploadées dans un bucket Supabase dédié et s'affichent en miniature cliquable dans le message.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Plusieurs dialogues dans un même paragraphe (ex. \"Hey !\" dit-il. \"Et toi ?\") sont maintenant chacun rendus en bulle distincte dans le mode Dialogues en bulles.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Menu profil revu : sous-menu de statut de présence (en ligne, hors ligne, invisible) avec pastille colorée sur l'avatar, lien vers le changement de mot de passe et vers le Changelog.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Nouvelle page Changelog avec disposition timeline, badges par catégorie, filtre latéral par tag et composant Hint réutilisable pour les tooltips.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Choix de la visibilité dans les paramètres d'un monde (flag Mondes publics activé) : basculer entre Privé (invitation uniquement) et Public (accessible par tous) depuis un sélecteur visuel dans les paramètres du monde.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Nouvelle page d'accueil avec grille des mondes (séparés en \"Mes mondes\" et \"Partagés avec moi\"), gestion du quota, et zoom au survol sur les bannières.",
  },
  {
    date: "2026-05",
    tag: "Chatrooms",
    text: "Les salons de discussion sont maintenant mis à jour en temps réel grâce à Supabase Realtime.",
  },
  {
    date: "2026-05",
    tag: "Personnages",
    text: "Nouveau sélecteur d'avatar avec support des cadres et configuration avancée.",
  },
  {
    date: "2026-05",
    tag: "Interface",
    text: "Refonte de la sidebar avec navigation par mondes, quota visible et menu utilisateur amélioré.",
  },
  {
    date: "2026-04",
    tag: "Boutique",
    text: "Lancement de la boutique : achetez des cadres et objets cosmétiques avec vos coins.",
  },
  {
    date: "2026-04",
    tag: "Personnages",
    text: "Sections personnalisables sur les fiches de personnages : ajoutez, réorganisez et supprimez des blocs.",
  },
  {
    date: "2026-03",
    tag: "Mondes",
    text: "Système d'invitation : invitez d'autres utilisateurs dans vos mondes avec des rôles distincts (admin, éditeur, joueur, observateur).",
  },
  {
    date: "2026-03",
    tag: "Notifications",
    text: "Indicateurs de messages non lus par monde et par salon.",
  },
];

export function groupByMonth(entries: ChangelogEntry[]) {
  const map = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.date) ?? [];
    list.push(entry);
    map.set(entry.date, list);
  }
  return map;
}

export function formatMonth(dateStr: string): string {
  const [year, month] = dateStr.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

export function allTags(entries: ChangelogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.tag))].sort();
}
