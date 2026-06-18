export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  // ── 2026-06 ──────────────────────────────────────────────────────────────
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Toile des relations dans les mondes :\n- Nouveau canvas accessible depuis l'icône Réseau (⊕) dans le rail latéral du monde\n- Blocs utilisateurs en pointillés, déplaçables librement sur le canvas — positions persistées par joueur et par monde\n- Cartes personas colorées par **groupe** (défini par le propriétaire du monde : nom + couleur) ; chaque joueur peut assigner ses propres personas à un groupe\n- **Relations directionnelles** : la flèche indique le sens déclaré par l'auteur\n- Si A→B et B→A existent avec le **même type** : double flèche (↔) sur un chemin unique\n- Si A→B et B→A existent avec des **types différents** : deux courbes décalées en parallèle avec un séparateur **/** au milieu, chacune de sa couleur\n- **6 types de relations** avec style de flèche distinct : Allié, Ennemi, Rival, Amant, Famille, Inconnu\n- **Description markdown** par relation, saisie au moment de la création ou éditée en ligne dans le panneau latéral\n- **Panneau persona** (gauche) : cliquer une carte affiche toutes ses relations sortantes et reçues, avec description éditable et bouton supprimer\n- **Mode lien** activable via le bouton « Créer un lien » dans la barre d'outils — en mode normal, cliquer une carte ouvre le panneau persona\n- Survol d'un lien : badge type + bouton Supprimer apparaissent au milieu de la flèche\n- **Permissions** : un joueur ne peut créer/supprimer que ses propres relations (depuis ses propres personas) ; les admins gardent un accès complet\n- **Types de relation dynamiques** : le propriétaire du monde peut créer, éditer et supprimer des types personnalisés (nom, couleur, style de trait) via le bouton Paramètres ; deux types par défaut (Allié et Ennemi) sont créés automatiquement\n- **Couleur de groupe dans les chatrooms** : le nom d'un persona apparaît dans la couleur de son groupe dans les messages des chatrooms du même monde",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Mondes favoris dans la sidebar :\n- Épingler un monde avec l'icône ★ sur sa bannière\n- Section **Mondes favoris** en haut de la sidebar, avec les 3 dernières chatrooms actives sous chaque monde favori\n- Pastille d'activité sur les chatrooms non lues\n- En mode rail (sidebar réduite) : survol d'une icône de monde affiche un popover avec le nom du monde et les chatrooms favorites récentes",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Préférences d'affichage par monde (persistées) :\n- **Aside redimensionnable** — glisser le séparateur vertical pour ajuster la largeur de la colonne personas (150–380 px)\n- **Mode plein écran** — icône sur la bannière du monde pour basculer entre contenu centré (max-w) et plein écran\n- Préférences sauvegardées par utilisateur et par monde dans `world_user_preferences`",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Les personas sont maintenant liés à un monde :\n- Chaque monde possède ses propres personas (jusqu'à 5 par compte gratuit)\n- Panneau **Personas** intégré à gauche dans la page d'un monde : créer, visualiser et éditer ses personnages sans quitter le monde\n- Page `/p` refaite en vue globale : tous les personas regroupés par monde avec lien direct vers le monde\n- Sur mobile, les personas sont accessibles via le bouton dédié dans le rail latéral",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Nouvelles options pour les encadrés :\n- **Jauges** — jusqu'à N barres nommées avec valeur actuelle / max et couleur personnalisable parmi 8 presets ; remplacent les anciens blocs « Jauge de vie »\n- **Image comme icône** — uploader une image depuis le bucket du chatroom pour l'utiliser à la place d'un emoji ou d'une icône ; l'image est liée aux médias du message et nettoyée à la suppression",
  },
  {
    date: "2026-06",
    tag: "Profil",
    text: "Dix blocs disponibles dans l'éditeur de profil des personnages :\n- **Titre** et **Bloc de texte** (markdown)\n- **Stats** — valeurs chiffrées avec unité, en grille adaptative\n- **Inventaire** — objets avec icône RPG, quantité et description au survol\n- **Compétences** — icône RPG, nom, niveau libre et description\n- **Jauges** — barres de progression avec valeur, max et couleur personnalisable\n- **Citation** — blockquote markdown avec source optionnelle\n- **Traits** — pills de personnalité\n- **Timeline** — chronologie avec date libre et description repliable\n- **Séparateur** et **Grille d'images**\n\nPlus de 4 100 icônes SVG issues de game-icons.net, sélectionnables via un picker avec recherche.",
  },
  {
    date: "2026-06",
    tag: "Personnages",
    text: "Améliorations de l'éditeur de personnage :\n- Édition d'apparence repensée : onglets Avatar / Cosmétiques et Générateur / Upload / URL alignés en sous-menus, aperçu grand format sur desktop\n- Cadre cosmétique persisté localement dès la sélection, sans rechargement\n- Gestion des sections : renommer, réordonner (gauche/droite) et supprimer via le bouton « … » de l'onglet actif\n- L'avatar se met à jour en temps réel dans les messages dès qu'il est modifié\n- Bouton d'édition au survol dans la grille, état vide harmonisé",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Blocs de jeu dans le composer (éditables et supprimables) :\n- **Lancé de dés** — formule personnalisable, préréglages, label optionnel, détection critique / fumble\n- **Encadré** — bloc narratif universel : icône (emoji Twitter, librairie Lucide 1800+ ou image uploadée), couleur d'accent, style de bordure (complète / gauche / séparateur / aucune), alignement, jauges nommées ; modèles prêts à l'emploi (Aparté, Souvenir, Scène, Ellipse, Ambiance)\n- **Révélation** — contenu masqué jusqu'au clic\n- **PNJ** — mini-fiche avec nom, rôle, icône et stats\n- **Jauge de vie** — barre colorée selon le seuil restant\n- **Bannière** — image pleine largeur\n- **Note privée** — visible uniquement par les destinataires choisis",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Composer et interface des salons :\n- Éditeur de blocs (contenteditable) avec indicateurs de paragraphes visuels et détection automatique des blocs au collage\n- **Dialogues en bulles** : les guillemets deviennent des bulles avec incise inline ; couleur personnalisable via un color picker avec courbes iso-contraste WCAG (AA / AAA) en temps réel\n- Images : coller ou uploader affiche un aperçu inline, puis une miniature cliquable dans le message\n- Indicateur de frappe intégré en languette animée sous le composer\n- Réactions avec picker emoji complet (thème sombre, en français, teinte de peau)\n- Suppression de ses propres messages avec confirmation\n- Options du composer visibles et modifiables lors de l'édition d'un message\n- Paramètres de salle repensés : bannière avec recadrage, icône modifiable, sauvegarde automatique",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Refonte de la page d'un monde :\n- Barre d'onglets intégrée sous la bannière, onglet Home avec conversations (composer + parties)\n- Le composer de démarrage de partie réutilise le composer complet des chatrooms (persona, dés, dialogues, médias…)\n- Nouveau panneau Membres : liste triée par rôle, stack des personas utilisés, bouton Inviter intégré\n- Choix de visibilité Privé / Public dans les paramètres\n- Page d'accueil avec grille « Mes mondes » / « Partagés avec moi », quota et zoom au survol",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Refonte de l'interface générale :\n- Sidebar : navigation en pilule avec bordure, icônes de monde dans le rail (repli sur initiale colorée), avatar avec pastille de présence en bas du rail, section « Partagés avec moi » masquée si vide\n- Panneaux latéraux empilés : recul et flou du fond, dépassement du panneau inférieur pour montrer la profondeur\n- Menu utilisateur : statut de présence tristate (en ligne / hors ligne / invisible), lien mot de passe, accès au Changelog\n- Nouvelle page Changelog : disposition timeline, badges par catégorie, filtre latéral par tag\n- **Pastille de présence** sur les avatars dans les salons : verte (actif < 5 min), orange (absent 5–10 min), grise (hors ligne) — le timer reflète l'activité réelle et n'est pas remis à zéro par les reconnexions réseau",
  },
  {
    date: "2026-06",
    tag: "Boutique",
    text: "Boutique remaniée : solde affiché dans l'en-tête (🪙), prix sur chaque article, mise en page harmonisée.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Optimisation des images :\n- Conversion automatique en WebP avant upload (−40 à −60 % de poids)\n- Servies en taille adaptée via la transformation d'images Supabase",
  },
  {
    date: "2026-06",
    tag: "Comptes",
    text: "Gestion des comptes :\n- Nouveau panneau de profil dans la sidebar : modifier son avatar (avec recadrage) et son pseudo sans quitter la page\n- Invitation par courriel stylisé avec création guidée de mot de passe et de pseudo\n- Pseudo obligatoire : dialogue bloquant à la première connexion jusqu'à définition d'un pseudo",
  },
  {
    date: "2026-06",
    tag: "Admin",
    text: "Panneau Fonctionnalités dans l'administration :\n- Activer / désactiver le constructeur d'avatar, la boutique, les réactions, les médias, les mondes publics et chaque type de bloc de profil individuellement\n- Flags « Créer une partie » et « Poster un message » pour masquer les composeurs\n- Modifications effectives immédiatement pour tous les utilisateurs, sans déploiement",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Authentification et comptes :\n- Identifiants auto-remplis par le navigateur pris en compte dès la première tentative\n- Liens d'invitation et de confirmation fonctionnels depuis n'importe quel appareil ou navigateur\n- Sessions expirées redirigées automatiquement vers la page de connexion\n- Suppression de compte sans blocage (personnages et messages conservés)\n- Plusieurs dialogues dans un même paragraphe correctement rendus en bulles distinctes",
  },
  {
    date: "2026-06",
    tag: "Technique",
    text: "Zéro erreur ESLint et TypeScript, build de production fiabilisé. La page « Mot de passe oublié » affiche une confirmation après l'envoi du lien.\n- Blocs de jeu des messages refondus autour d'un wrapper universel (carte + barre d'outils éditer/supprimer) et d'un aiguilleur unique : ajouter ou restyler un bloc se fait désormais en un seul endroit.",
  },
  {
    date: "2026-06",
    tag: "Mobile",
    text: "8 px d'espace sur tous les côtés de la carte principale. Le composeur s'ajuste à la largeur du conteneur au lieu d'un padding fixe.",
  },
  // ── 2026-05 ──────────────────────────────────────────────────────────────
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
  // ── 2026-04 ──────────────────────────────────────────────────────────────
  {
    date: "2026-04",
    tag: "Boutique",
    text: "Lancement de la boutique : achetez des cadres et objets cosmétiques avec vos coins.",
  },
  {
    date: "2026-04",
    tag: "Personnages",
    text: "Sections personnalisables sur les fiches de personnages : ajoutez, réorganisez et supprimez des blocs.",
  },
  // ── 2026-03 ──────────────────────────────────────────────────────────────
  {
    date: "2026-03",
    tag: "Mondes",
    text: "Système d'invitation : invitez d'autres utilisateurs dans vos mondes avec des rôles distincts (admin, éditeur, joueur, observateur).",
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
