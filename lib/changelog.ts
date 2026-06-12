export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
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
    text: "Choix de la visibilité à la création d'un monde : Privé (invitation uniquement) ou Public (accessible par tous).",
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
