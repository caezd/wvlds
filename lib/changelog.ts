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
    category: "Interface",
    text: "Le journal des versions se filtre par catégorie puis par sous-catégorie (Monde, Wiki, Carte…) ; chaque nouvelle entrée porte sa date du jour, et les entrées d’un mois tiennent dans une liste compacte.",
  },
  {
    date: "2026-09-26",
    category: "Interface",
    area: "Monde",
    text: "La chronologie d’un monde devient une frise verticale : les années en très grands chiffres, un fil, et pour chaque salon un anneau, son titre — « par Persona (@pseudo) », le persona dans la couleur de son groupe — puis sa date, un filet à chaque changement de mois, son nom posé dessus en capitales. Un trait rouge plein, du fil jusqu’au bord, marque la date actuelle du monde et la frise s’ouvre sur son année ; au-delà de cinq ans, des pastilles mènent à chaque période.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Membres",
    text: "Chaque membre a une carte propre au monde — présentation, disponibilités, fuseau horaire (les autres voient l’heure qu’il est chez lui), anniversaire — et un statut : actif, en pause ou absent jusqu’à une date. Elle se règle depuis « Ma carte dans ce monde », en tête de la liste des membres, et paraît sur son profil ; un gestionnaire peut régler le statut d’un membre.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Membres",
    text: "L’onglet Membres présente chacun en carte, groupée par plus haut rôle : avatar, statut en ligne et personas joués, chacun ouvrant sa fiche. Une recherche filtre par membre ou par persona, et le compteur « en ligne » ne garde que les connectés d’un clic. Le menu d’une carte attribue les rôles ou retire le membre ; une invitation propose un rôle.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Compte",
    text: "« Mon profil » réunit l’avatar, le pseudo, la présentation et les pronoms du compte.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Rôles",
    text: "Rôles personnalisés : chaque monde crée les siens dans ses réglages — nom, couleur, icône et permissions à cocher (écrire, créer des salons, modifier le wiki, la carte, le catalogue, gérer les membres…). Un membre en cumule plusieurs ; les rôles se classent en hiérarchie, on ne gère que ceux situés sous le sien et l’on ne confère que ce que l’on possède. Chaque monde part avec Administrateur, Éditeur, Joueur et Spectateur.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Rôles",
    text: "Permissions « Valider les fiches », « Gérer les PNJ », « Jouer les PNJ » et « Commenter le wiki » ; « Modifier le wiki » garde la modération des fils. Les images d’un monde suivent la permission de ce qu’elles illustrent : catégorie, salon, wiki, carte ou catalogue.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Validation des fiches, en option dans les réglages du monde : une fiche naît en brouillon, son éditeur liste ce qui manque — champs rendus obligatoires par le modèle, faceclaim si le monde l’exige — et « Soumettre à validation » s’active une fois la fiche complète. Un relecteur la valide ou la renvoie avec un commentaire ; seules les fiches validées jouent dans les salons, et un badge le signale sur les tuiles.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "PNJ partagés : un persona du monde que plusieurs membres font parler, créé avec « Gérer les PNJ » et choisi dans le salon avec « Jouer les PNJ ». Ses messages disent « PNJ · joué par @pseudo » ; il ne compte pas dans le quota, naît validé, et un monde en compte trente au plus.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Un persona a un statut narratif — vivant, disparu, décédé, retiré — visible sur ses tuiles, sa fiche et ses messages. La liste des personas se cherche, se filtre depuis un seul menu (joueur, groupe, statut, type, état de la fiche) et se trie par nom ou par date.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Chaque persona tient un journal de bord, onglet Journal de sa fiche : des entrées en Markdown que son joueur écrit et que tous les membres lisent. Dans un monde à chronologie, une entrée se date et le journal suit l’ordre du récit.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Les membres d’un monde lisent la fiche complète de ses personas. Une fiche s’enregistre avec le bouton « Enregistrer » ; la fermer avec des modifications en attente demande quoi en faire. Un monde sans faceclaims retire ce champ des fiches.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "« Fiches soumises à validation » prévient les relecteurs, « Relecture de mes fiches » prévient le joueur d’une fiche validée ou renvoyée. Chacune a son réglage, ouvre la fiche concernée et arrive aussi en notification push.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Tapez @ pour mentionner un membre, un rôle, @tous ou @ici (les membres présents). Les mentions s’affichent en puces colorées et chaque personne visée reçoit une seule notification par message ; les rôles et les @tous ont leur propre réglage. Un rôle se rend « mentionnable par tous » dans ses réglages.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Quand un persona ne peut pas écrire, le sélecteur et le bouton d’envoi disent pourquoi : fiche incomplète ou non validée, quota du plan gratuit, PNJ sans permission.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Dans un message, « [[Page]] » ouvre la page du wiki et « [[lieu:Le port]] » ouvre la carte sur ce lieu. Le centre de recherche fouille aussi le wiki et les lieux de la carte.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chronologie : les réglages montrent la date actuelle du récit telle que les salons l’afficheront. Deux options permettent de restreindre les salons à la période en cours et d’exiger une date à la création d’un salon ; « Utiliser les mois réels » reste disponible.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Deux blocs pour l’accueil d’un monde : « Carte » (la carte en vignette, ses onglets et son nombre de lieux) et « Anniversaires ». « Membres en ligne » s’affiche en rangée d’avatars ou en liste nommée.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Un type de relation peut être réciproque : la relation attend l’accord du joueur d’en face, notifié, puis existe dans les deux sens. Couple et mariage fonctionnent ainsi : désigner un·e conjoint·e envoie la demande, rompre libère les deux fiches.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Une relation se crée dans un dialogue — de qui, vers qui, quel type, une description — et se modifie sur place ; une demande en attente se dessine en pointillé. La légende du canevas filtre par type ou par groupe et masque les personas retirés ou décédés.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Relations",
    text: "La fiche d’un persona a un onglet « Relations » : ce qu’il pense des autres, ce qu’on pense de lui. Une demande s’y accepte ou s’y refuse.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Chaque objet et chaque compétence a sa fiche, ouverte depuis le catalogue comme depuis un persona : image, rareté, plafond par fiche, propriétés libres (poids, portée…), description en Markdown et pages du wiki liées. Une compétence prend une icône de l’application ou une image.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Une compétence peut exiger d’autres compétences. Dans un monde qui restreint les compétences au catalogue, elle ne s’ajoute à une fiche qu’une fois ses prérequis présents ; le sélecteur nomme ce qui manque.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Un objet peut se composer d’autres objets : sa recette (ingrédients et quantités) se règle dans son éditeur, et sa fiche la montre en arbre, avec les objets qu’il sert à fabriquer.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Une catégorie du catalogue a une description et une bannière, affichées en tête quand on la déplie. Elle se replie d’un clic, compte ses entrées et retient son état.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Un objet se crée et se modifie dans le même dialogue ; « Créer et continuer » enchaîne les saisies. Chaque ligne a son menu (modifier, dupliquer, déplacer, supprimer), une sélection multiple agit sur plusieurs objets d’un coup, et le nombre de personnages qui portent un objet s’affiche à côté de son nom.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Renommer un objet le renomme sur toutes les fiches. Un objet supprimé reste trente jours en corbeille, signalé dans les fiches ; le restaurer le leur rend.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Le catalogue se cherche par nom ou par description, s’exporte dans un fichier et s’importe dans un autre monde, catégories comprises. Un cadenas sur chaque onglet dit s’il est restreint ou en saisie libre.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Un monde peut avoir plusieurs cartes — le continent, la capitale, un donjon — en onglets réordonnables, et une épingle peut mener à une autre carte. Une image de carte pèse jusqu’à 60 Mo (JPEG, PNG, GIF ou WebP).",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Des régions : un outil de tracé pose les sommets d’un royaume, d’une forêt, d’une mer, avec un nom, une couleur, une description et une page du wiki.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "L’échelle d’une carte se règle sur une distance connue et s’affiche dans le coin. L’outil règle relie deux lieux d’un trait, nommé si vous le souhaitez, avec la distance.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Dans un monde à chronologie, un lieu a une date de fondation et de disparition, et la carte affiche une époque : ce qui n’existe pas alors s’estompe.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "La fiche d’un lieu s’ouvre dans une colonne à côté de la carte : bannière avec « Jouer ici », description, carte et région, lieux reliés, salons qui s’y jouent, personas présents et page du wiki. « M’installer ici » y pose un de vos personas.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Carte",
    text: "La liste des lieux cherche dans toutes les cartes du monde et centre la carte sur le lieu choisi. Les lieux portent leur nom en permanence et apparaissent en temps réel ; l’adresse suit la carte et le lieu ouverts, pour partager un lien.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "« [[ » propose les pages du monde et « # » leurs sections ; un lien peut viser une section (« [[Arkham#Le port]] »). Survoler un lien affiche un aperçu de la page.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Une image se colle ou se dépose dans un article et s’ouvre en grand d’un clic. Une page supprimée part en corbeille avec ses fiches, commentaires et images ; un éditeur la restaure, et elle disparaît d’elle-même après trente jours.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Les modifications récentes se listent depuis la colonne des pages, brouillons en attente compris pour les éditeurs. La recherche fouille aussi les fiches de notes, et l’adresse suit la page lue.",
  },
  {
    date: "2026-09",
    category: "Fonctionnalité",
    text: "« Signaler un problème », dans votre menu : décrivez le souci, joignez jusqu’à trois captures d’écran et, après un plantage, la trace d’erreur. La même page suit l’avancement de vos signalements.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Page d’accueil",
    text: "La description d’un monde se lit sous la bannière, juste après le titre et sur toute la largeur. Une fois le titre défilé, une barre garde le nom du monde, le menu, la recherche et le favori en haut de la page.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Monde",
    text: "Réglages, onglet Communauté : visibilité, public visé et avatars acceptés se choisissent en deux segments ou deux cartes ; les tags tiennent dans un seul cadre, avec un compteur et des suggestions.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Salons",
    text: "La fenêtre de création d’un salon s’intitule « Nouveau jeu » : la date se choisit à droite du titre, sur une ligne (jour, mois, année), et le titre au hasard se tire depuis son champ.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Membres",
    text: "La carte d’un membre se lit de haut en bas : identité, présentation, activité, disponibilités, anniversaire ; au-delà de quatre personas, une pastille « +N ». Chaque section de la liste porte l’icône ou la couleur de son rôle.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Rôles",
    text: "Sur écran étroit, la fiche d’un rôle se déplie dans sa ligne.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Relations",
    text: "Sur petit écran, les personas se présentent en cartes, une rangée par joueur, avec leur nombre de relations et les demandes en attente.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Carte",
    text: "La carte remplit son cadre sur tout écran, zoome jusqu’à 6× et se pince à deux doigts ; sur téléphone, la liste des lieux s’ouvre en tiroir. Les lieux s’atteignent au clavier, et le tracé d’une région suit la souris.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Wiki",
    text: "Pages, fiches de notes et catégories se réordonnent aussi depuis leur menu ⋯, sans glisser-déposer.",
  },
  {
    date: "2026-09",
    category: "Interface",
    area: "Emoji",
    text: "Le sélecteur d’emoji prend les couleurs de l’application, avec des onglets de catégories en icônes.",
  },
  {
    date: "2026-09",
    category: "Interface",
    text: "Le sélecteur de couleur montre le code hexadécimal, à lire, taper ou coller. Zones de texte et onglets reprennent l’habillage des champs.",
  },
  {
    date: "2026-09",
    category: "Interface",
    text: "Les réglages d’un monde sont traduits en anglais et en espagnol.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    text: "Sous Firefox avec plusieurs onglets ouverts, l’envoi d’une image ou la création d’un monde pouvait ne jamais aboutir. Quand l’envoi de l’image d’une catégorie échoue, le recadrage reste affiché avec un message.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    text: "Au retour sur l’application, la connexion temps réel repart aussitôt : présence, messages et notifications. Un retour en ligne ne recharge plus la page, et un formulaire en cours est conservé.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Page d’accueil",
    text: "L’accueil d’un monde avec le bloc des anniversaires tombait en erreur, et un clic dans les réglages d’un bloc le déplaçait.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Personas",
    text: "Un administrateur ne pouvait pas régler la fiche de persona par défaut.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Relations",
    text: "Changer le type ou la description d’une relation depuis le canevas ne s’enregistrait pas.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Salons",
    text: "La poignée de déplacement d’une catégorie de salons s’annonce aux lecteurs d’écran.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Carte",
    text: "Une épingle tout juste posée apparaissait en double. Supprimer un lieu demande confirmation.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Wiki",
    text: "La barre d’outils encadre le texte sélectionné en laissant les espaces hors des marqueurs.",
  },
  {
    date: "2026-09",
    category: "Correctif",
    area: "Compte",
    text: "Se déconnecter affichait « Session expirée » et échouait en navigation privée.",
  },
  {
    date: "2026-09",
    category: "Performance",
    area: "Carte",
    text: "La carte s’ouvre sans attente, reste fluide sous le zoom même chargée d’épingles, et gagne en netteté par paliers.",
  },
  {
    date: "2026-09",
    category: "Performance",
    area: "Wiki",
    text: "La recherche et l’arbre des pages restent fluides sur un wiki fourni.",
  },
  {
    date: "2026-09",
    category: "Technique",
    text: "Ce que vous saisissez est vérifié côté serveur : adresses d’images en http(s), couleurs en hexadécimal, longueur maximale par champ. Un envoi refusé l’est avec un message clair.",
  },

  // ── 2026-08 ──────────────────────────────────────────────────────────────
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Brouillon et publication : la rédaction s’enregistre seule, et les autres la voient après « Publier ». Chaque page garde l’historique de ses versions publiées, avec aperçu et restauration.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Liens internes « [[Titre de la page]] », mis à jour quand la page visée est renommée. Quatre modèles de page à la création : personnage, lieu, faction, événement. Une recherche et un fil d’Ariane aident à s’y retrouver.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Une page ou un dossier peut être réservé aux éditeurs du monde. Une page peut s’ouvrir sur une bannière, avec l’icône, le titre et une description courte par-dessus.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Une page se commente : un bouton dans la marge de chaque bloc ouvre un fil qui suit le texte, arrive en temps réel et se marque résolu.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Chaque page a ses notes : des fiches en Markdown classées par catégories (vue d’ensemble, entités, lieux… ou les vôtres), écrites par les éditeurs et lues par les membres. Notes et commentaires partagent une colonne redimensionnable à droite.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Lexique du monde : des termes définis par un administrateur, mis en évidence dans le wiki, avec leur description au clic.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "L’accueil d’un monde se compose depuis Réglages → Page d’accueil : une grille de 12 colonnes où placer et redimensionner des blocs, avec un espacement réglable et les statistiques du monde sous le titre en option.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Blocs Bannière, HTML (balisage et style séparés, aperçu exact, sans script), Markdown, Annonce, Statistiques, Membres en ligne, Raccourcis wiki, Personas récents, Catégories et Raccourcis chronologie. HTML et Markdown prennent une hauteur fixe ou la pleine largeur.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Monde",
    text: "La carte et le wiki se désactivent depuis Réglages → Fonctions, sans rien supprimer, et le lien vers le wiki s’y renomme. Chaque mois du calendrier d’un monde a son nombre de jours, et la chronologie regroupe les salons par mois.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Centre de recherche des messages : filtres par salon, auteur, mentions, pièce jointe, date, type d’auteur et épinglé, combinables avec une recherche texte.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Clic droit ou appui long sur une bulle de dialogue pour copier sa couleur.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Personas",
    text: "« Aperçu » montre une fiche telle qu’on la voit depuis un salon. Une fiche sans onglet propose de créer le premier en un clic ; les « sections » s’appellent des « onglets ».",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Messagerie",
    text: "Messages privés : modifier ou supprimer ses messages, recherche dans l’historique, indicateur « en train d’écrire », et blocage d’un joueur depuis une conversation.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    area: "Compte",
    text: "Le niveau, l’XP, les pièces et la série de jours s’affichent sur le profil joueur.",
  },
  {
    date: "2026-08",
    category: "Fonctionnalité",
    text: "WVLDS s’installe comme une application depuis le navigateur mobile, et reste en partie utilisable hors connexion.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Wiki",
    text: "L’article s’écrit en Markdown coloré, avec une barre d’outils, ses raccourcis clavier et Ctrl+Z ; il défile avec sa bannière, ses commandes dans un pied fixe. Le wiki ouvre sa première page à l’arrivée.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Wiki",
    text: "Sur écran étroit, les colonnes s’ouvrent en tiroirs et l’article prend toute la largeur. Glisser une page affiche un aperçu flottant et la pose avant, après ou dans un dossier.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Page d’accueil",
    text: "Le bloc Catégories passe en liste compacte à côté d’un autre bloc, en étagère de cartes sur toute la largeur. Sur mobile, les marges se réduisent et « Insérer un bloc » s’ouvre en tiroir, avec un aperçu de chaque bloc.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Salons",
    text: "Une catégorie de salons a une image et s’affiche en grande carte avec sa description. La liste des salons montre l’heure du dernier message et l’avatar de son auteur ; sur mobile, les actions de l’en-tête d’un salon tiennent dans un menu ⋮.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Personas",
    text: "La fiche affiche la couleur de dialogue (un clic copie son code) et le cadre d’avatar, sous une bannière estompée ; ses onglets restent en haut au défilement. Les images d’une galerie se redimensionnent, se déplacent et prennent un fond.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Membres",
    text: "Les membres d’un monde ont une pastille de présence.",
  },
  {
    date: "2026-08",
    category: "Interface",
    area: "Monde",
    text: "Le bouton « Mondes » de la barre d’icônes ramène au dernier monde visité et liste vos favoris ; l’en-tête de la barre latérale sert de sélecteur de monde. Les cartes de l’Explorateur restent carrées sur tout écran.",
  },
  {
    date: "2026-08",
    category: "Interface",
    text: "L’application est entièrement traduite en anglais et en espagnol, hors mentions légales. Accessibilité : contrastes relevés, commandes au survol accessibles au clavier, libellés sur les boutons à icône.",
  },
  {
    date: "2026-08",
    category: "Interface",
    text: "Les onglets du navigateur portent le nom du salon, du monde ou de la section. Les images se chargent sur une version floutée d’elles-mêmes, et les enregistrements de réglages se confirment.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Wiki",
    text: "Glisser-déposer : une page ne sortait pas d’un dossier, un dossier pouvait entrer dans son propre contenu, et sur téléphone saisir une poignée refermait le tiroir. Confirmer la suppression d’un commentaire ou d’une page figeait l’application.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Page d’accueil",
    text: "L’éditeur de grille montre exactement la disposition finale et ses boutons répondent sur écran tactile. L’accueil d’un monde clignotait au chargement sur mobile.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Salons",
    text: "Un message épinglé pouvait apparaître dans le mauvais salon, et un message pouvait être chiffré avec la clé d’un autre salon. Les très longs messages partent, et les messages ne s’affichent pas en double après une reconnexion.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Salons",
    text: "Le Markdown est interprété dans les bulles de dialogue, la recherche ignore les accents, et changer de salon ou de monde remet à zéro les épingles, étoiles et filtres.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    area: "Personas",
    text: "Le recadrage d’une bannière de persona suit les proportions affichées, et la nouvelle bannière s’affiche aussitôt. Une liste descriptive accepte les retours à la ligne.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    text: "Sécurité : fichiers de personas et de salons protégés contre l’écrasement, invitations réservées aux administrateurs, clés de chiffrement, votes et défis lisibles des seuls membres, soldes et récompenses protégés contre la double comptabilisation.",
  },
  {
    date: "2026-08",
    category: "Correctif",
    text: "Les messages d’erreur suivent votre langue, et une erreur imprévue affiche un écran avec « Réessayer ». Toute écriture qui échoue le signale. Les images recadrées gardent leur netteté.",
  },
  {
    date: "2026-08",
    category: "Performance",
    text: "Pages de monde et de salon allégées : droits, profil et personas chargés une fois, présence mise à jour bulle par bulle, outils du composeur chargés à l’ouverture. Déchiffrement des messages accéléré, images envoyées en parallèle.",
  },
  {
    date: "2026-08",
    category: "Performance",
    text: "Explorateur, personas, boutique, connexion et accueil d’un monde chargent avec moins de requêtes. La liste des salons n’ouvre qu’une connexion temps réel.",
  },
  {
    date: "2026-08",
    category: "Technique",
    text: "Ménage interne : code dupliqué regroupé, dépendances figées, base de données décrite dans le projet et durcie, tests sur toutes les pages de l’espace connecté.",
  },

  // ── 2026-07 ──────────────────────────────────────────────────────────────
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Un monde peut être réservé aux 18 ans et plus : la date de naissance est demandée à l’entrée. L’onglet « Communauté » des réglages accueille jusqu’à 10 tags et le type d’avatars accepté, filtrables dans l’Explorateur.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Un clic sur un monde de l’Explorateur ouvre ses statistiques et le bouton Rejoindre. Un monde se quitte depuis le sélecteur de la barre latérale (clic droit), sauf pour son propriétaire.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Fiche de persona par défaut : chaque persona créé dans le monde démarre avec sa structure, dont les champs verrouillés ne se suppriment pas. Faceclaims : « ft. … » à côté du nom, et un onglet dédié dans le catalogue.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Suivre un persona : une notification à chaque nouveau salon ou réponse. Nouveau champ « Liste descriptive » : des paires titre et description.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Statut marital et conjoint sur la fiche d’un persona ; le joueur du conjoint reçoit une demande à confirmer.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Barre de mise en forme à la sélection : gras, italique, barré, souligné, liste, titres, couleur. La couleur des bulles de dialogue suit le persona et se change ponctuellement avec `\"Bonjour !\"{#ff0000}`.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Bloc « Choix » (2 à 9 options à voter, résultats en temps réel), avertissements de contenu en tête du message, et messages « SMS » en bulles regroupées.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Page d’accueil",
    text: "Les cartes de catégories filtrent les parties d’un clic, et le filtre se partage par lien.",
  },
  {
    date: "2026-07",
    category: "Fonctionnalité",
    area: "Compte",
    text: "Connectez votre compte Patreon : l’abonnement s’active au palier requis et se retire si le mécénat s’arrête. Le choix du pseudo a son propre écran à la première connexion ; bio et pronoms s’affichent sur le profil joueur.",
  },
  {
    date: "2026-07",
    category: "Interface",
    area: "Salons",
    text: "Confort de lecture : police (sans serif, serif, adaptée à la dyslexie), taille et alignement du texte. Le sélecteur de persona du composeur est alphabétique, favoris en tête ; le menu des blocs décrit chacun avec un aperçu.",
  },
  {
    date: "2026-07",
    category: "Interface",
    area: "Salons",
    text: "Une catégorie de salons peut avoir sa propre image.",
  },
  {
    date: "2026-07",
    category: "Interface",
    area: "Personas",
    text: "Page Personas : glisser-déposer entre mondes pour déplacer ou copier, vue par monde ou alphabétique.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    area: "Personas",
    text: "Sortir un persona d’un monde libère les verrous de sa fiche, et le quota est vérifié au déplacement. La page Personas affiche les mondes rejoints même sans persona.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    area: "Salons",
    text: "Sur mobile, Entrée crée un paragraphe et Maj+Entrée envoie. Un spectateur peut réagir à un message, la catégorie « Général » affiche ses salons, et la pastille « nouveau salon » reste jusqu’à son ouverture.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    area: "Catalogue",
    text: "Le lien « Catalogue » s’affiche dès qu’objets, compétences ou faceclaims sont activés, et les réglages d’inventaire et de compétences fonctionnent.",
  },
  {
    date: "2026-07",
    category: "Correctif",
    text: "Présence, messages et notifications se reconnectent après une coupure réseau. Le bouton Rejoindre de l’Explorateur fonctionne, et une déconnexion ne mène plus au monde d’un autre compte.",
  },
  {
    date: "2026-07",
    category: "Performance",
    text: "Images redimensionnées, servies en formats modernes et chargées à la demande. Démarrage en une seule requête, onglets et panneaux chargés à l’ouverture.",
  },
  {
    date: "2026-07",
    category: "Technique",
    text: "Compteurs de non-lus tenus localement, sur un seul canal temps réel.",
  },

  // ── 2026-06 ──────────────────────────────────────────────────────────────
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Mondes publics dans l’Explorateur, avec recherche et bouton Rejoindre. Invitations par notification, mondes favoris en haut de la barre latérale.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Composeur : dialogues en bulles colorées, images, indicateur de frappe, réactions, et blocs de jeu (dés, encadré avec jauges, révélation, PNJ, jauge de vie, bannière, note privée).",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Défis quotidiens : un défi par joueur et par jour, un badge sur le message gagnant. La barre latérale d’un monde classe les salons en Actifs, Suivis et Tous.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Les personas appartiennent à un monde (5 par monde en gratuit). Leur éditeur offre des onglets renommables et dix blocs — stats, inventaire, compétences, jauges, traits, timeline… — avec plus de 4 100 icônes.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Relations",
    text: "Toile des relations : personas colorés par groupe, relations typées et orientées avec description, types personnalisables.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Wiki",
    text: "Wiki par monde : pages en Markdown et dossiers en arborescence, modifiables par les éditeurs.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Carte",
    text: "Carte interactive par monde : image de fond, épingles avec titre, description, bannière, icône et couleur, zoom et temps réel.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Catalogue d’objets et de compétences par monde, organisé en catégories ; un monde peut y restreindre l’inventaire et les compétences.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Messagerie",
    text: "Messages privés entre joueurs, avec rail de conversations, présence et chargement des anciens messages au défilement.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "Notifications : mentions, réactions, nouveaux membres, nouveaux salons, réponses groupées. Préférences par type, archivage, temps réel.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    area: "Compte",
    text: "Interface en français, anglais et espagnol, détectée automatiquement et synchronisée entre appareils. Profil dans la barre latérale et invitation par courriel.",
  },
  {
    date: "2026-06",
    category: "Fonctionnalité",
    text: "Panneau d’administration des fonctionnalités : chaque fonction s’active ou se désactive, avec effet immédiat.",
  },
  {
    date: "2026-06",
    category: "Interface",
    text: "Nouvelle disposition : rail permanent à gauche, panneau des notifications et messages, barre latérale propre à chaque monde, menu latéral sur mobile. Menu utilisateur avec statut de présence.",
  },
  {
    date: "2026-06",
    category: "Interface",
    area: "Boutique",
    text: "Solde dans l’en-tête de la boutique, prix sur chaque article.",
  },
  {
    date: "2026-06",
    category: "Correctif",
    text: "Connexion et inscription : identifiants auto-remplis pris en compte, liens d’invitation valables partout, sessions expirées redirigées, « Mot de passe oublié » confirme l’envoi. Plus de 404 à l’ouverture d’un monde.",
  },
  {
    date: "2026-06",
    category: "Performance",
    text: "Pages plus rapides : requêtes en parallèle, profil et session lus une fois, images en WebP à la bonne taille.",
  },
  {
    date: "2026-06",
    category: "Technique",
    text: "Tests automatisés unitaires et de bout en bout ; règles de sécurité de la base consolidées.",
  },

  // ── 2026-05 ──────────────────────────────────────────────────────────────
  {
    date: "2026-05",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Les salons se mettent à jour en temps réel.",
  },
  {
    date: "2026-05",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Sélecteur d’avatar avec cadres et configuration avancée.",
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
    text: "Lancement de la boutique : cadres et objets cosmétiques contre vos pièces.",
  },
  {
    date: "2026-04",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Sections personnalisables sur les fiches de personnages.",
  },

  // ── 2026-03 ──────────────────────────────────────────────────────────────
  {
    date: "2026-03",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Invitations dans vos mondes, avec des rôles distincts : admin, éditeur, joueur, observateur.",
  },
  {
    date: "2026-03",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "Indicateurs de messages non lus par monde et par salon.",
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
