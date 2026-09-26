/**
 * Catégories du journal des versions, dans l'ordre d'affichage du filtre.
 * Une entrée porte toujours une catégorie (la nature du changement) et, le
 * plus souvent, une sous-catégorie (la partie de l'application concernée).
 */
export const CHANGELOG_CATEGORIES = [
  "Fonctionnalité",
  "Interface",
  "Correctif",
  "Performance",
  "Technique",
] as const;

export const CHANGELOG_AREAS = [
  "Monde",
  "Page d’accueil",
  "Salons",
  "Personas",
  "Membres",
  "Rôles",
  "Relations",
  "Wiki",
  "Carte",
  "Catalogue",
  "Emoji",
  "Messagerie",
  "Notifications",
  "Compte",
  "Boutique",
] as const;

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];
export type ChangelogArea = (typeof CHANGELOG_AREAS)[number];

export type ChangelogEntry = {
  /** "2026-09-26" ; les entrées antérieures au 2026-09-26 n'ont que le mois ("2026-06"). */
  date: string;
  category: ChangelogCategory;
  /** Sous-catégorie ; absente pour ce qui touche toute l'application. */
  area?: ChangelogArea;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  // ── 2026-09 ──────────────────────────────────────────────────────────────
  {
    date: "2026-09-26",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Les joueurs relient leurs salons : un salon peut faire suite à un ou plusieurs autres, dès sa création (« Suite de… » dans « Nouveau jeu ») ou depuis ses réglages. Relier un salon où l’on ne joue pas en fait une suite proposée : ses participants reçoivent une demande à accepter, et la chronologie la trace en pointillés (à la couleur de l’arc quand elle rejoint sa chaîne) jusque-là. Une suite ne remonte jamais le temps : on ne relie un salon qu’à un salon situé au plus tard à sa date. Une nouvelle permission, « Relier des salons », donnée aux joueurs, encadre le tout.",
  },
  {
    date: "2026-09-26",
    category: "Interface",
    text: "Journal des versions :\n- filtre par catégorie, puis par sous-catégorie\n- date du jour sur chaque nouvelle entrée\n- entrées en liste compacte le long d’une frise des mois",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Membres",
    text: "Carte de membre propre à chaque monde, réglée depuis « Ma carte dans ce monde » :\n- présentation, disponibilités, anniversaire\n- fuseau horaire : les autres voient son heure locale\n- statut : actif, en pause ou absent jusqu’à une date (réglable aussi par un gestionnaire)",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Membres",
    text: "Onglet Membres en cartes, groupées par plus haut rôle :\n- avatar, statut en ligne, personas joués (chacun ouvre sa fiche)\n- recherche par membre ou par persona\n- filtre « en ligne » d’un clic\n- menu par carte : attribuer des rôles, retirer le membre\n- invitation avec choix du rôle",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Compte",
    text: "« Mon profil » réunit avatar, pseudo, présentation et pronoms.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Rôles",
    text: "Rôles personnalisés par monde :\n- nom, couleur, icône et permissions à cocher\n- plusieurs rôles par membre\n- hiérarchie : on ne gère que les rôles inférieurs au sien, on ne confère que ce qu’on possède\n- rôles de départ : Administrateur, Éditeur, Joueur, Spectateur",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Rôles",
    text: "Nouvelles permissions : « Valider les fiches », « Gérer les PNJ », « Jouer les PNJ », « Commenter le wiki ». Les images d’un monde suivent la permission de ce qu’elles illustrent.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Validation des fiches, en option dans les réglages du monde :\n- une fiche naît en brouillon ; l’éditeur liste ce qui manque (champs obligatoires, faceclaim si exigé)\n- « Soumettre à validation » une fois la fiche complète\n- un relecteur valide ou renvoie avec un commentaire\n- seules les fiches validées jouent ; un badge l’indique sur les tuiles",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "PNJ partagés, que plusieurs membres font parler :\n- créés avec « Gérer les PNJ », joués avec « Jouer les PNJ »\n- messages signés « PNJ · joué par @pseudo »\n- hors quota, validés d’office, trente par monde au plus",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Statut narratif (vivant, disparu, décédé, retiré), visible sur les tuiles, la fiche et les messages. Liste des personas avec recherche, tri (nom, date) et filtres : joueur, groupe, statut, type, état de la fiche.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Journal de bord sur chaque fiche : entrées Markdown écrites par le joueur, lues par tous, datées dans la chronologie du monde s’il en a une.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Fiches de persona :\n- lisibles en entier par les membres du monde\n- bouton « Enregistrer », avec alerte si l’on ferme sans enregistrer\n- champ faceclaim masqué dans un monde qui ne les utilise pas",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "Notifications de fiches, en push aussi :\n- « Fiches soumises à validation », pour les relecteurs\n- « Relecture de mes fiches », pour le joueur",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Mentions avec @ (membre, rôle, @tous, @ici) :\n- puces colorées dans le message\n- une notification par personne et par message\n- réglages distincts pour les rôles et @tous\n- rôle « mentionnable par tous » en option",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Un persona qui ne peut pas écrire affiche pourquoi : fiche incomplète ou non validée, quota gratuit atteint, PNJ sans permission.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Dans un message, « [[Page]] » ouvre le wiki et « [[lieu:Le port]] » la carte. Le centre de recherche couvre aussi le wiki et les lieux.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chronologie :\n- date actuelle du récit affichée dans les réglages\n- option : salons limités à la période en cours\n- option : date obligatoire à la création d’un salon",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Blocs « Carte » (vignette, onglets, nombre de lieux) et « Anniversaires ». « Membres en ligne » en avatars ou en liste.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Relations réciproques : acceptées par le joueur d’en face (notifié), elles valent dans les deux sens. Couple et mariage en font partie ; rompre libère les deux fiches.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Canevas des relations :\n- création dans un dialogue (de qui, vers qui, type, description), modification sur place\n- demandes en attente en pointillé\n- légende qui filtre par type ou par groupe et masque retirés et décédés",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Onglet « Relations » sur la fiche d’un persona : ce qu’il pense des autres et l’inverse ; demandes à accepter ou refuser.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Fiche détaillée pour chaque objet et compétence, depuis le catalogue ou un persona :\n- image, rareté, plafond par fiche, propriétés libres (poids, portée…)\n- description Markdown, pages du wiki liées\n- icône de l’application ou image pour une compétence",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Prérequis de compétences : dans un catalogue restreint, une compétence ne s’ajoute qu’une fois ses prérequis acquis ; le sélecteur nomme ce qui manque.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Recettes : un objet se compose d’autres objets (ingrédients, quantités), en arbre sur sa fiche, avec ce qu’il sert à fabriquer.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Catégories du catalogue : description, bannière, nombre d’entrées, repli mémorisé.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Gestion du catalogue :\n- création et modification dans le même dialogue, « Créer et continuer »\n- menu par ligne : modifier, dupliquer, déplacer, supprimer\n- sélection multiple\n- nombre de porteurs à côté de chaque objet",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Renommer un objet le renomme sur toutes les fiches. Supprimé, il reste trente jours en corbeille ; le restaurer le rend aux fiches.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Recherche par nom ou description, export et import entre mondes, cadenas sur les onglets restreints.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Plusieurs cartes par monde, en onglets réordonnables ; une épingle peut mener à une autre carte. Images jusqu’à 60 Mo (JPEG, PNG, GIF, WebP).",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Régions tracées sur la carte : nom, couleur, description, page du wiki.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Échelle réglée sur une distance connue, avec barre d’échelle. Outil règle : trait nommé entre deux lieux, distance incluse.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Lieux dans le temps : dates de fondation et de disparition ; la carte affiche une époque et estompe ce qui n’y existe pas.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Fiche de lieu dans une colonne à côté de la carte :\n- bannière avec « Jouer ici »\n- description, carte et région\n- lieux reliés, salons, personas présents, page du wiki\n- « M’installer ici » pour y placer un persona",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Liste des lieux cherchable sur toutes les cartes, noms toujours affichés, mises à jour en temps réel, adresse partageable vers une carte ou un lieu.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Liens internes : « [[ » propose les pages, « # » leurs sections (« [[Arkham#Le port]] ») ; aperçu de la page au survol.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Images collées ou déposées dans un article, agrandies d’un clic. Corbeille de trente jours pour les pages supprimées, avec leurs fiches, commentaires et images.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Modifications récentes depuis la colonne des pages (brouillons en attente compris, pour les éditeurs). Recherche étendue aux fiches de notes ; adresse partageable.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    text: "« Signaler un problème », dans votre menu : description, jusqu’à trois captures, trace d’erreur après un plantage. Suivi de vos signalements sur la même page.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Page d’accueil",
    text: "Description du monde sous la bannière, pleine largeur. Au défilement, une barre garde le nom, le menu, la recherche et le favori.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Monde",
    text: "Onglet Communauté : visibilité, public et avatars en choix segmentés ; tags dans un seul champ, avec compteur et suggestions.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Salons",
    text: "Fenêtre « Nouveau jeu » : date à droite du titre (jour, mois, année), titre au hasard depuis son champ.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Membres",
    text: "Carte de membre de haut en bas : identité, présentation, activité, disponibilités, anniversaire. Pastille « +N » au-delà de quatre personas ; sections de la liste marquées du rôle.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Rôles",
    text: "Sur écran étroit, un rôle se déplie dans sa ligne.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Relations",
    text: "Sur petit écran, personas en cartes, une rangée par joueur, avec relations et demandes en attente.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Carte",
    text: "Carte plein cadre, zoom jusqu’à 6×, pincement sur mobile, liste des lieux en tiroir sur téléphone, lieux accessibles au clavier.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Wiki",
    text: "Pages, fiches et catégories réordonnables depuis leur menu ⋯.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Emoji",
    text: "Sélecteur d’emoji aux couleurs de l’application, onglets en icônes.",
  },
  {
    date: "2026-09",
    category: "Interface",
    text: "Sélecteur de couleur avec code hexadécimal éditable. Zones de texte et onglets harmonisés avec les champs.",
  },
  {
    date: "2026-09",
    category: "Interface",
    text: "Réglages d’un monde traduits en anglais et en espagnol.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    text: "Envoi d’image ou création de monde bloqués sous Firefox avec plusieurs onglets. Recadrage d’une image de catégorie conservé, avec un message, si l’envoi échoue.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    text: "Connexion temps réel rétablie dès le retour sur l’application. Un retour en ligne ne recharge plus la page et ne vide plus un formulaire.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Page d’accueil",
    text: "Erreur sur un accueil avec le bloc Anniversaires ; bloc déplacé par un clic dans ses réglages.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Personas",
    text: "Fiche de persona par défaut non modifiable par un administrateur.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Relations",
    text: "Modification d’une relation depuis le canevas non enregistrée.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Salons",
    text: "Poignée d’une catégorie de salons annoncée aux lecteurs d’écran.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Carte",
    text: "Épingle affichée en double après sa pose. Confirmation avant de supprimer un lieu.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Wiki",
    text: "Barre d’outils : espaces laissés hors des marqueurs de mise en forme.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Compte",
    text: "Déconnexion : « Session expirée » affiché à tort, échec en navigation privée.",
  },
  {
    date: "2026-09",
    category: "Performance",
    area: "Carte",
    text: "Carte ouverte sans attente, fluide au zoom même chargée, netteté progressive.",
  },
  {
    date: "2026-09",
    category: "Performance",
    area: "Wiki",
    text: "Recherche et arbre des pages fluides sur un grand wiki.",
  },
  {
    date: "2026-09",
    category: "Technique",
    text: "Saisies vérifiées côté serveur (images en http(s), couleurs hexadécimales, longueurs maximales), avec un refus clairement expliqué.",
  },

  // ── 2026-08 ──────────────────────────────────────────────────────────────
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Brouillon et publication : enregistrement automatique, visible des autres après « Publier ». Historique des versions avec aperçu et restauration.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Pages reliées par « [[Titre]] », liens mis à jour au renommage. Modèles de page (personnage, lieu, faction, événement), recherche, fil d’Ariane.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Pages et dossiers réservables aux éditeurs. Bannière de page avec icône, titre et description.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Commentaires par bloc, depuis la marge : fils en temps réel, qui suivent le texte et se marquent résolus.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Notes de page : fiches Markdown par catégories, écrites par les éditeurs, lues par les membres, dans une colonne redimensionnable partagée avec les commentaires.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Lexique du monde : termes mis en évidence dans le wiki, définition au clic.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Accueil d’un monde composable (Réglages → Page d’accueil) : grille de 12 colonnes, blocs redimensionnables, espacement réglable, statistiques en option.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Blocs disponibles :\n- Bannière, HTML (sans script, aperçu exact), Markdown, Annonce\n- Statistiques, Membres en ligne, Personas récents, Catégories\n- Raccourcis wiki, Raccourcis chronologie\n\nHTML et Markdown : hauteur fixe ou pleine largeur.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Réglages → Fonctions : carte et wiki désactivables sans perte, lien du wiki renommable. Mois du calendrier de longueur libre ; chronologie groupée par mois.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Centre de recherche des messages : texte et filtres (salon, auteur, mentions, pièce jointe, date, type d’auteur, épinglé).",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Couleur d’une bulle de dialogue copiée par clic droit ou appui long.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Bouton « Aperçu » : la fiche vue depuis un salon. Premier onglet créé en un clic ; les « sections » deviennent des « onglets ».",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Messagerie",
    text: "Messages privés : modification, suppression, recherche, indicateur de frappe, blocage d’un joueur.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Compte",
    text: "Niveau, XP, pièces et série de jours sur le profil joueur.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    text: "Application installable depuis le navigateur mobile, en partie utilisable hors connexion.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Wiki",
    text: "Éditeur Markdown coloré : barre d’outils, raccourcis, Ctrl+Z, commandes dans un pied fixe. Première page ouverte à l’arrivée.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Wiki",
    text: "Écran étroit : colonnes en tiroirs, article pleine largeur. Glisser-déposer avec aperçu : avant, après ou dans un dossier.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Page d’accueil",
    text: "Bloc Catégories en liste compacte ou en étagère selon sa largeur. Mobile : marges réduites, « Insérer un bloc » en tiroir avec aperçus.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Salons",
    text: "Catégories de salons en grandes cartes illustrées. Liste des salons avec heure et auteur du dernier message. Mobile : actions de l’en-tête dans un menu ⋮.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Personas",
    text: "Fiche : couleur de dialogue copiable, cadre d’avatar, bannière estompée, onglets fixés en haut. Galerie d’images redimensionnables et déplaçables.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Membres",
    text: "Pastille de présence sur les membres.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Monde",
    text: "Bouton « Mondes » : dernier monde visité et favoris. Sélecteur de monde en tête de la barre latérale. Cartes carrées dans l’Explorateur.",
  },
  {
    date: "2026-08",
    category: "Interface",
    text: "Application traduite en anglais et en espagnol (hors mentions légales). Accessibilité : contrastes, commandes au clavier, libellés des boutons à icône.",
  },
  {
    date: "2026-08",
    category: "Interface",
    text: "Titre d’onglet du navigateur selon la page, images chargées sur un aperçu flouté, enregistrements confirmés.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Wiki",
    text: "Glisser-déposer : sortie de dossier, dossier déposé en lui-même, tiroir refermé sur téléphone. Application figée après la suppression d’une page ou d’un commentaire.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Page d’accueil",
    text: "Éditeur de grille fidèle à la disposition finale et utilisable au doigt. Clignotement de l’accueil sur mobile.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Salons",
    text: "Messages :\n- épinglé affiché dans le mauvais salon\n- chiffré avec la clé d’un autre salon\n- très longs messages refusés\n- doublons après reconnexion",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Salons",
    text: "Markdown dans les bulles de dialogue, recherche insensible aux accents, état remis à zéro en changeant de salon.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Personas",
    text: "Recadrage et rafraîchissement de la bannière ; retours à la ligne dans une liste descriptive.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    text: "Sécurité :\n- fichiers de personas et de salons protégés contre l’écrasement\n- invitations réservées aux administrateurs\n- clés de chiffrement, votes et défis réservés aux membres\n- soldes et récompenses protégés contre le double crédit",
  },
  {
    date: "2026-08",
    category: "Correctif",
    text: "Erreurs traduites, écran d’erreur avec « Réessayer », échecs d’écriture signalés, images recadrées plus nettes.",
  },
  {
    date: "2026-08",
    category: "Performance",
    text: "Pages de monde et de salon allégées : données chargées une fois, présence mise à jour par bulle, outils du composeur à la demande. Déchiffrement plus rapide, images envoyées en parallèle.",
  },
  {
    date: "2026-08",
    category: "Performance",
    text: "Moins de requêtes sur l’Explorateur, les personas, la boutique, la connexion et l’accueil d’un monde ; une seule connexion temps réel pour la liste des salons.",
  },
  {
    date: "2026-08",
    category: "Technique",
    text: "Ménage interne : code dédupliqué, dépendances figées, base de données décrite et durcie, tests sur toutes les pages connectées.",
  },

  // ── 2026-07 ──────────────────────────────────────────────────────────────
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Mondes 18+ : date de naissance demandée à l’entrée. Onglet Communauté : jusqu’à 10 tags et type d’avatars, filtrables dans l’Explorateur.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Explorateur : statistiques et bouton Rejoindre au clic sur un monde. Quitter un monde par clic droit dans le sélecteur (sauf propriétaire).",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Fiche par défaut du monde, appliquée aux nouveaux personas, avec champs verrouillés. Faceclaims : « ft. … » après le nom, onglet dédié au catalogue.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Suivre un persona : notification à chaque nouveau salon ou réponse. Champ « Liste descriptive » (titre et description).",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Statut marital et conjoint, confirmés par le joueur du conjoint.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Mise en forme à la sélection : gras, italique, barré, souligné, liste, titres, couleur. Couleur de dialogue liée au persona, modifiable ponctuellement : `\"Bonjour !\"{#ff0000}`.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Nouveaux éléments de message :\n- bloc « Choix » : 2 à 9 options, votes en temps réel\n- avertissement de contenu en tête\n- messages « SMS » en bulles regroupées",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Cartes de catégories filtrantes, filtre partageable par lien.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Compte",
    text: "Connexion Patreon : abonnement activé au palier requis, retiré à la fin du mécénat. Écran de choix du pseudo ; bio et pronoms sur le profil.",
  },
  {
    date: "2026-07",
    category: "Interface",
    area: "Salons",
    text: "Confort de lecture : police (dont une adaptée à la dyslexie), taille, alignement. Sélecteur de persona alphabétique avec favoris ; menu des blocs avec aperçus.",
  },
  {
    date: "2026-07",
    category: "Interface",
    area: "Salons",
    text: "Image propre à chaque catégorie de salons.",
  },
  {
    date: "2026-07",
    category: "Interface",
    area: "Personas",
    text: "Page Personas : glisser-déposer entre mondes (déplacer ou copier), vue par monde ou alphabétique.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    area: "Personas",
    text: "Verrous de fiche libérés à la sortie d’un monde, quota vérifié au déplacement, mondes sans persona affichés.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    area: "Salons",
    text: "Mobile : Entrée pour un paragraphe, Maj+Entrée pour envoyer. Réactions des spectateurs, salons de la catégorie « Général », pastille « nouveau salon ».",
  },
  {
    date: "2026-07",
    category: "Correctif",
    area: "Catalogue",
    text: "Lien « Catalogue » et réglages d’inventaire et de compétences.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    text: "Reconnexion après une coupure réseau, bouton Rejoindre de l’Explorateur, redirection vers le monde d’un autre compte après déconnexion.",
  },
  {
    date: "2026-07",
    category: "Performance",
    text: "Images redimensionnées, formats modernes, chargement différé. Démarrage en une requête, onglets et panneaux chargés à l’ouverture.",
  },
  {
    date: "2026-07",
    category: "Technique",
    text: "Compteurs de non-lus locaux, sur un seul canal temps réel.",
  },

  // ── 2026-06 ──────────────────────────────────────────────────────────────
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Explorateur des mondes publics (recherche, Rejoindre), invitations par notification, favoris en haut de la barre latérale.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Composeur :\n- bulles de dialogue colorées, images, réactions, indicateur de frappe\n- blocs de jeu : dés, encadré avec jauges, révélation, PNJ, jauge de vie, bannière, note privée",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Défis quotidiens, avec badge sur le message gagnant. Salons classés en Actifs, Suivis et Tous.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Personas rattachés à un monde (5 par monde en gratuit). Éditeur à onglets, dix blocs (stats, inventaire, compétences, jauges, traits, timeline…) et plus de 4 100 icônes.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Toile des relations : personas colorés par groupe, relations typées et orientées, types personnalisables.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Wiki par monde : pages Markdown en arborescence, modifiables par les éditeurs.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Carte interactive : image de fond, épingles personnalisées, zoom, temps réel.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Catalogue d’objets et de compétences par catégories, avec restriction possible de l’inventaire et des compétences.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Messagerie",
    text: "Messages privés : rail de conversations, présence, historique au défilement.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "Notifications en temps réel (mentions, réactions, membres, salons, réponses groupées), préférences par type, archivage.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Compte",
    text: "Interface en français, anglais et espagnol, détectée et synchronisée. Profil dans la barre latérale, invitation par courriel.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    text: "Administration : chaque fonctionnalité s’active ou se désactive instantanément.",
  },
  {
    date: "2026-06",
    category: "Interface",
    text: "Nouvelle disposition : rail d’icônes, panneau notifications et messages, barre latérale par monde, menu latéral sur mobile, statut de présence.",
  },
  {
    date: "2026-06",
    category: "Interface",
    area: "Boutique",
    text: "Solde affiché, prix sur chaque article.",
  },
  {
    date: "2026-06",
    category: "Correctif",
    text: "Connexion : auto-remplissage, liens d’invitation, sessions expirées, confirmation de « Mot de passe oublié ». Erreur 404 à l’ouverture d’un monde.",
  },
  {
    date: "2026-06",
    category: "Performance",
    text: "Requêtes en parallèle, session et profil lus une fois, images WebP à la bonne taille.",
  },
  {
    date: "2026-06",
    category: "Technique",
    text: "Tests automatisés ; règles de sécurité de la base consolidées.",
  },

  // ── 2026-05 ──────────────────────────────────────────────────────────────
  {
    date: "2026-05",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Salons en temps réel.",
  },
  {
    date: "2026-05",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Sélecteur d’avatar avec cadres et réglages avancés.",
  },
  {
    date: "2026-05",
    category: "Interface",
    text: "Barre latérale : navigation par mondes, quota visible, menu utilisateur.",
  },

  // ── 2026-04 ──────────────────────────────────────────────────────────────
  {
    date: "2026-04",
    category: "Fonctionnalité",
    area: "Boutique",
    text: "Boutique : cadres et objets cosmétiques contre des pièces.",
  },
  {
    date: "2026-04",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Sections personnalisables sur les fiches.",
  },

  // ── 2026-03 ──────────────────────────────────────────────────────────────
  {
    date: "2026-03",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Invitations dans vos mondes, avec rôles : admin, éditeur, joueur, observateur.",
  },
  {
    date: "2026-03",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "Non-lus par monde et par salon.",
  },
];

export function groupByMonth(entries: ChangelogEntry[]) {
  const map = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const list = map.get(month) ?? [];
    list.push(entry);
    map.set(month, list);
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

/** « 26 sept. » pour une entrée datée au jour, null pour une entrée datée au mois. */
export function formatDay(dateStr: string): string | null {
  const [year, month, day] = dateStr.split("-");
  if (!day) return null;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Catégories présentes dans les entrées, chacune avec ses sous-catégories, dans l'ordre déclaré. */
export function categoryTree(
  entries: ChangelogEntry[],
): { category: ChangelogCategory; areas: ChangelogArea[] }[] {
  return CHANGELOG_CATEGORIES.filter((c) => entries.some((e) => e.category === c)).map(
    (category) => ({
      category,
      areas: CHANGELOG_AREAS.filter((a) =>
        entries.some((e) => e.category === category && e.area === a),
      ),
    }),
  );
}

/**
 * Filtre actif : une catégorie cochée sans sous-catégorie garde toute la
 * catégorie ; avec des sous-catégories, seulement celles-ci.
 */
export type ChangelogFilter = Map<ChangelogCategory, Set<ChangelogArea>>;

export function matchesFilter(entry: ChangelogEntry, filter: ChangelogFilter): boolean {
  if (filter.size === 0) return true;
  const areas = filter.get(entry.category);
  if (!areas) return false;
  return areas.size === 0 || (entry.area !== undefined && areas.has(entry.area));
}
