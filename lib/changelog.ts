export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  // ── 2026-06 ──────────────────────────────────────────────────────────────
  {
    date: "2026-06",
    tag: "Notifications",
    text: "Notification agrégée de réponses dans une chatroom :\n- Nouveau type **Réponse dans une chatroom** : lorsque quelqu'un répond dans un salon où vous avez déjà participé, une notification groupée apparaît — un seul message, pas un par réponse\n- Un **compteur** s'incrémente et la notification remonte en tête de liste à chaque nouveau message\n- La notification est **réinitialisée après lecture** : une fois lue, elle devient désuète ; le prochain message crée une nouvelle notification fraîche (count = 1) plutôt que d'incrémenter silencieusement celle déjà lue\n- Archiver la notification fonctionne de la même manière que les autres types",
  },
  {
    date: "2026-06",
    tag: "Technique",
    text: "Environnement de tests automatisés :\n- **221 tests** répartis sur 28 fichiers couvrant la logique pure, les server actions (Supabase mocké), les composants (jsdom) et les hooks temps réel\n- Nouveaux modules extraits pour la testabilité : `lib/notifHelpers.ts` (formatage des notifications), `lib/composerMessage.ts`, `lib/xp.ts`, `lib/persona-display.ts`\n- Couverture des helpers de notification (`emojiFromContent`, `notifText`, `notifHref`, `compactTime`), du catalogue monde (CRUD items/skills/catégories, batch réordonnancement), de la carte interactive (pins, upsert), et du middleware de session (régression du 404 monde)\n- Suite Playwright pour les parcours E2E (smoke + routes protégées)",
  },
  {
    date: "2026-06",
    tag: "Corrections",
    text: "Correction d'un **404 à l'ouverture d'un monde** (avec disparition de la sidebar) :\n- En cause : le middleware réécrivait la réponse sur les routes `/w/...` sans recopier les cookies de session rafraîchis, ce qui faisait paraître l'utilisateur déconnecté côté serveur — la page ne trouvait alors plus le monde et renvoyait un 404, même pour des mondes accessibles. La session est désormais préservée sur toutes les routes monde\n- Nettoyage de mondes hérités restés **sans propriétaire** (créés avant le câblage de l'ownership), qui étaient inaccessibles à tous\n- La colonne `owner_id` des mondes est désormais **obligatoire** (NOT NULL), empêchant qu'un monde puisse à nouveau exister sans propriétaire",
  },
  {
    date: "2026-06",
    tag: "Corrections",
    text: "Correction du chargement de la page /home et de la sidebar :\n- Les mondes où l'utilisateur a une **invitation en attente** n'apparaissent plus dans la liste « Partagés avec moi » avant qu'il ait accepté\n- Les mondes **quittés** (où l'utilisateur a encore un persona) n'apparaissent plus dans la sidebar ni dans /home\n- Les mondes **archivés** n'apparaissent plus dans la sidebar",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Système d'invitations pour rejoindre un monde :\n- Inviter un utilisateur via le dialogue existant envoie désormais une **invitation** au lieu d'ajouter directement le membre\n- Cliquer **Rejoindre** dans la notification navigue directement vers le monde et ferme le panneau\n- Accéder à l'URL d'un monde sans en être membre ou propriétaire retourne maintenant un 404 propre (y compris pour les utilisateurs invités mais n'ayant pas encore accepté)\n- La table `world_invitations` stocke l'invitation avec statut `pending` / `accepted` / `declined`\n- L'utilisateur ciblé reçoit une **notification** de type **Invitation de monde** dans le panneau de notifications\n- La carte de notification affiche : icône du monde, nom cliquable (→ dialogue de présentation avec bannière, icône et description), bouton **Rejoindre** et bouton **✕** pour refuser\n- Accepter ajoute automatiquement l'utilisateur aux membres du monde avec le rôle indiqué ; refuser ferme l'invitation\n- Si l'utilisateur était déjà membre du monde, l'ancienne logique de modification de rôle est conservée\n- Le dialogue de présentation du monde est accessible directement depuis la notification sans quitter la page courante",
  },
  {
    date: "2026-06",
    tag: "Notifications",
    text: "Système de notifications centralisé :\n- **Cloche** dans le rail de la sidebar avec badge de non-lus + bouton **Notifications** au-dessus de Personas dans la sidebar étendue\n- Quatre types d'événements : **@mentions**, **réactions** sur vos messages, **nouveaux membres** dans un monde, **nouvelles chatrooms** créées\n- Les mentions `@username` dans les messages génèrent une notification en temps réel pour les destinataires\n- Les réactions et événements de monde sont créés automatiquement par des triggers PostgreSQL\n- **Panneau inline** : cliquer la cloche ou le bouton ouvre un panneau qui **pousse le contenu principal** — visible au même niveau que la sidebar, avec la même carte arrondie\n- Liste scrollable, non-lus en évidence, bouton \"Tout lire\", navigation directe vers le message ou la chatroom concerné\n- **Préférences** par type : désactiver individuellement chaque catégorie via l'icône engrenage dans le panel — les notifications désactivées ne sont **pas envoyées en base** (trigger `BEFORE INSERT`), elles ne s'accumulent pas silencieusement\n- **Archiver** une notification : bouton ✕ visible au survol en coin supérieur droit de chaque notification — suppression immédiate de la liste, archivage soft en base (non rechargée)\n- **Pagination** : chargement initial limité à 20 notifications, les 10 suivantes se chargent automatiquement au scroll vers le bas (infinite scroll)\n- Mises à jour en temps réel via Supabase Realtime",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Carte interactive par monde :\n- Nouveau panneau **Carte** accessible depuis l'icône carte dans le rail latéral d'un monde\n- Les éditeurs et propriétaires peuvent importer une image comme fond de carte (jusqu'à 20 Mo, convertie en WebP)\n- En mode modification, **cliquer n'importe où sur la carte** ouvre un mini-formulaire inline pour nommer un pin — appuyer sur Entrée ou ✓ pour le créer\n- Chaque pin apparaît comme un **cercle coloré** positionné exactement à l'endroit cliqué\n- Cliquer un pin ouvre une **popover flottante** avec : bannière optionnelle en header, titre du lieu et description en markdown\n- La popover se positionne intelligemment pour rester dans l'écran (bascule gauche/droite/haut selon la position du pin)\n- En mode modification : édition inline du titre et de la description, upload de la bannière par pin, bouton supprimer\n- Survol d'un pin : label du lieu visible, bouton supprimer (mode édition)\n- **Zoom 100–200 %** à la molette centré sur le curseur ; **glisser-déposer** pour déplacer un pin et enregistrer sa nouvelle position\n- **Personnalisation visuelle par pin** : cliquer le petit cercle coloré dans la popover ouvre un éditeur — icône Lucide au choix, couleur de fond, couleur de l'icône, bordure (style + couleur) ; chaque valeur est optionnelle (fond transparent, sans icône, sans bordure)\n- Mises à jour en temps réel : les pins ajoutés ou modifiés par d'autres éditeurs apparaissent sans recharger\n- Lecture seule pour tous les membres ; modification réservée aux propriétaires, admins et éditeurs\n- La fonctionnalité peut être activée ou désactivée globalement via le flag **`world_map`** dans l'administration (catégorie Mondes)",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Wiki par monde :\n- Nouveau panneau **Wiki** accessible depuis l'icône livre dans le rail latéral d'un monde\n- Créer des **pages** (contenu markdown) et des **dossiers** pour les organiser en arborescence\n- Navigation par arbre dans la sidebar : dossiers dépliables, pages sélectionnables\n- Chaque page et dossier peut avoir une **icône Lucide** personnalisée, choisie lors de la création ou du renommage (cliquer l'icône du nœud en mode édition ouvre le sélecteur)\n- Édition inline du contenu en markdown, avec aperçu rendu\n- Menus contextuels par nœud : renommer, ajouter une page dans un dossier, supprimer\n- Gestion réservée aux propriétaires, admins et éditeurs du monde ; lecture disponible pour tous les membres",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Toile des relations et Catalogue accessibles depuis les chatrooms :\n- Les icônes **Relations** (réseau) et **Catalogue** (librairie) apparaissent dans le rail d'icônes d'une chatroom lorsque celle-ci est associée à un monde\n- Cliquer l'une d'elles remplace temporairement la vue de la chatroom par le canvas ou le catalogue — le bouton s'active visuellement et un second clic referme la vue\n- La restriction d'inventaire/compétences du monde est respectée dans le catalogue ouvert depuis une chatroom",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Catalogue d'objets et de compétences par monde :\n- Dans les paramètres du monde, deux nouveaux réglages : **Inventaire restreint** et **Compétences restreintes**\n- Quand activé, les personas ne peuvent posséder que des entrées définies dans le catalogue du monde — plus de saisie libre\n- Vue **Catalogue** accessible depuis le rail latéral (icône librairie), visible uniquement quand au moins une restriction est active\n- Deux sous-onglets dans la vue : **Objets** et **Compétences**, masqués si la restriction correspondante est inactive\n- **Catégories** dans le catalogue : créer des catégories séparées pour les objets et pour les compétences ; glisser-déposer les entrées entre catégories ou pour les réordonner ; supprimer une catégorie déplace ses entrées dans « Sans catégorie »\n- **Colonnes de catégories** : glisser une catégorie à gauche ou à droite d'une autre pour l'isoler dans une colonne distincte (max. 3 colonnes) ; les colonnes s'empilent en une seule sur mobile ; déposer dans la zone « Nouvelle colonne » qui apparaît pendant le glissement ; chaque colonne possède son propre bouton « Créer une catégorie »\n- Gestion du catalogue (ajout, édition inline, suppression, catégories) réservée aux propriétaires, admins et éditeurs du monde\n- Tous les membres peuvent consulter le catalogue en lecture\n- Dans l'éditeur de persona en mode restreint : icône et nom de l'objet/compétence proviennent du catalogue (figés), seuls la **quantité** (inventaire) et le **niveau** (compétences) sont modifiables par persona\n- Activation d'une restriction purge immédiatement les données concernées des personas existants (action irréversible, avec confirmation)",
  },
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
    text: "Refonte de la page d'un monde :\n- Barre d'onglets intégrée sous la bannière, onglet Home avec conversations (composer + parties)\n- Le composer de démarrage de partie réutilise le composer complet des chatrooms (persona, dés, dialogues, médias…)\n- Nouveau panneau Membres : liste triée par rôle, stack des personas utilisés, bouton Inviter intégré\n- Choix de visibilité Privé / Public dans les paramètres\n- Page d'accueil avec grille « Mes mondes » / « Partagés avec moi », quota et zoom au survol\n- **Quitter un monde** : le menu « ⋮ » de chaque monde dans la sidebar permet désormais de quitter (membres uniquement, propriétaires exclus)",
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
