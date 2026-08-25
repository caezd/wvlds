export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  // ── 2026-08 ──────────────────────────────────────────────────────────────
  {
    date: "2026-08",
    tag: "Personas",
    text: "Les « sections » d'une fiche de persona s'appellent désormais des « onglets », ce qui correspond mieux à ce qu'on manipule à l'écran. Toute cette partie de l'éditeur est aussi traduite en anglais et en espagnol, alors qu'elle était restée en français.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Édition d'une fiche sur mobile : tous les boutons qui n'apparaissaient qu'au survol (monter, descendre, supprimer un champ, et les suppressions dans l'inventaire, les compétences, les jauges, les traits, la chronologie et les listes) sont désormais visibles en permanence — le survol n'existe pas au tactile. Le bloc de texte s'ajuste aussi à la hauteur de son contenu au lieu de scroller, et passe en plus petit sur mobile. Un onglet vide reprend enfin le séparateur « ⊕ » habituel pour ajouter un champ, au lieu d'un bouton et d'un message dédiés.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "La zone de recadrage d'une bannière de persona était bien plus large que la bannière une fois affichée : environ 38% de la largeur choisie était rognée silencieusement, sans que l'aperçu ne le montre. Le recadrage et ses aperçus correspondent désormais exactement aux proportions réelles.",
  },
  {
    date: "2026-08",
    tag: "Chatrooms",
    text: "Clic droit (ou appui long sur mobile) sur une bulle de dialogue colorée dans une chatroom : « Copier la couleur de dialogue » copie son code hexadécimal. Corrige au passage un bug où ouvrir le profil d'un persona depuis un message pouvait faire surgir par erreur le menu d'options de ce message par-dessus — un appui long n'ouvre plus jamais son menu tant qu'un autre panneau est affiché.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "La sheet d'un profil persona (ouverte depuis une chatroom ou ailleurs) perd elle aussi son bouton de fermeture (✕) — swiper ou cliquer en dehors suffit, comme pour la sheet d'édition.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Cliquer sur la pastille « Couleur de dialogue » d'une fiche persona (depuis une chatroom, ou en aperçu dans la sheet d'édition) copie son code hexadécimal dans le presse-papier.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "La fiche d'un persona sans aucune section affiche désormais un profil vide (juste bannière/avatar/nom) plutôt que le message « Aucune section. ».",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Les onglets d'un profil de persona (édition, aperçu, fiche publique) passent d'un style en pastille pleine à un soulignement, comme dans les paramètres d'un monde, et restent épinglés en haut du panneau une fois l'en-tête (bannière + avatar) défilé hors du cadre — la liste défile aussi horizontalement (comme les paramètres) au lieu de déborder, pour que le bouton « + Ajouter un onglet » reste toujours atteignable sur mobile. Dans l'éditeur, le bouton « ⋯ » (déplacer/renommer/supprimer un onglet) se rattache maintenant à son onglet plutôt que de flotter dans l'espacement entre onglets, et la bordure de chaque champ ainsi que le bouton d'ajout entre deux champs (masqués au survol seulement) restent visibles sur mobile, où il n'y a pas de survol.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Changer la bannière d'un persona puis fermer/rouvrir sa fiche d'édition faisait disparaître le changement (la fiche se rouvrait avec l'ancienne bannière, jamais rafraîchie depuis le serveur) — contrairement à l'avatar, qui rafraîchissait déjà correctement. Corrigé.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Un bouton « Aperçu » (pastille superposée au coin de la bannière) dans la sheet d'édition d'un persona bascule vers le rendu exact de la fiche vue depuis une chatroom (même composant, même padding), sans quitter l'édition. Son avatar utilise désormais le même contour (`outline`, par-dessus l'image) que la fiche publique, au lieu d'une bordure qui la recadrait différemment. Le bouton de fermeture (✕) de ce drawer est retiré — swiper ou cliquer en dehors suffit.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Les images d'une section « Galerie » d'un profil de persona deviennent modulables : chaque image se redimensionne en glissant sa poignée en coin, jusqu'à occuper toute la largeur de sa ligne si elle est seule, et peut être déplacée (y compris recentrée sur sa propre ligne, sans perdre sa largeur) ou vers une autre ligne — un encadré affiche désormais l'emplacement exact où elle atterrira pendant le glissement. Un bouton par image permet d'afficher ou non un fond derrière elle. Les images sont affichées en entier plutôt que recadrées et gardent leurs propres proportions (hauteur naturelle) — y compris sur mobile, où leur largeur respecte le même %age de la grille qu'en édition, et où les boutons d'action restent visibles sans survol.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "La fiche d'un persona affiche désormais sa couleur de dialogue quand elle est définie, et son cadre d'avatar équipé — chargé mais jamais affiché jusqu'ici. La bannière s'estompe aussi en fondu vers le bas plutôt que de s'arrêter net, comme sur la page d'accueil d'un monde.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sur mobile, le bouton menu pouvait devenir inaccessible pendant le chargement d'une conversation, de l'Explorateur ou d'un onglet de monde (membres, personas, wiki, chronologie…) : un bouton de secours s'affiche désormais pendant tout le temps de chargement.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Dans le panneau Chronologie, les salons sont désormais regroupés par mois (pas seulement par année) : chaque mois a son propre titre et une puce reliée à la ligne de temps de l'année. L'en-tête du panneau a aussi son icône.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "La Toile des relations d'un monde a une recherche dans son en-tête (icône loupe, se déplie en champ de saisie au clic) : trouver un persona par son nom ou par le pseudo de son joueur filtre la liste mobile et estompe les cartes non correspondantes sur le canevas desktop.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "La Toile des relations d'un monde a désormais une vue mobile dédiée : le canevas (courbes, pan/zoom), illisible en petit écran, est remplacé par une liste de personas groupée par joueur — taper l'un d'eux ouvre ses relations, et un bouton dédié permet d'en créer une nouvelle sans passer par le canevas.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les boutons éditer/réglages/supprimer d'un bloc dans l'éditeur de grille de la page d'accueil (Réglages > Page d'accueil) n'apparaissaient qu'au survol de la souris — invisibles, et donc impossibles à atteindre, sur écran tactile. Ils restent maintenant affichés en permanence.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "En taille mobile, les onglets Paramètres et Catalogue d'un monde affichaient un fond plus clair que les autres onglets (Wiki, Membres, Personas, Chronologie…), qui laissent voir le fond ambiant plus sombre de l'application — les deux sont désormais cohérents.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Dans l'éditeur de grille de la page d'accueil (Réglages > Page d'accueil), les boutons éditer/réglages/supprimer d'un bloc ne réagissaient presque jamais à un clic précis sur leur icône — celui-ci était interprété comme un début de glisser-déposer du bloc, empêchant l'action de s'exécuter.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Nouveau bloc « Bannière » pour la page d'accueil d'un monde : titre, texte court, image de fond et bouton d'action optionnels, dans un éditeur inspiré du modal des encadrés de chatroom (aperçu en direct). Les blocs HTML et Markdown peuvent en plus être affichés en plein largeur, sans bordure ni fond, plutôt qu'en carte — un réglage disponible dans leur éditeur de contenu.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "En déplaçant ou redimensionnant un bloc dans l'éditeur de grille de la page d'accueil (Réglages > Page d'accueil), un grillage des 12 colonnes s'affiche en fond pour repérer l'alignement, aligné sur la bordure en pointillé de l'éditeur.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Nouveau widget « Raccourcis chronologie » pour la page d'accueil d'un monde : un petit calendrier pour parcourir les salons déjà situés dans la Chronologie (dates fictives) — flèches pour changer de mois/année, bande des jours du mois avec une pastille sur ceux qui ont une entrée, liste du jour sélectionné en dessous, et un lien vers la chronologie complète. Chaque mois du calendrier d'un monde a désormais son propre nombre de jours (réglable depuis Réglages > Fonctions > Chronologie ; le préréglage « mois réels » applique automatiquement les longueurs grégoriennes). Disponible pour les mondes où la Chronologie est activée.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le bloc « Raccourcis wiki » de la page d'accueil affiche désormais son heure de dernière modification dans la langue courante (au lieu de toujours l'afficher en français), le bloc « Membres en ligne » ne charge plus que les profils des membres réellement en ligne (au lieu de tous les membres du monde à chaque rafraîchissement), et un bloc HTML personnalisé porte maintenant un titre pour les technologies d'assistance.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L'espacement entre les blocs de la page d'accueil se règle désormais depuis Réglages > Page d'accueil (compact, confortable ou spacieux), avec un aperçu fidèle directement dans l'éditeur. Sur mobile et tablette, glisser un bloc ou la frontière entre deux colonnes ne fait plus défiler la page par erreur, et les zones de saisie sont plus faciles à attraper au doigt.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "L'éditeur de grille (Réglages > Page d'accueil) a été reconstruit sur le même mécanisme d'affichage que la page d'accueil elle-même : il montre donc exactement la disposition finale, et toute une série de défauts disparaît d'un coup — étirement au changement d'onglet, décalage de largeur permanent, animation parasite au chargement, bloc voisin renvoyé à la ligne au lieu de se partager la largeur, fantôme superposé pendant un glissement. Étirer la frontière entre deux colonnes se fait maintenant des deux côtés, et redimensionne bien les deux blocs à la fois.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les icônes de monde (sélecteur de monde, favoris et rail d'icônes de la sidebar, page d'accueil) et les images de catégorie sur la page d'accueil ne s'affichaient plus du tout dans certains cas, ou très dégradées — un réglage de dimensionnement d'image mal formé faisait demander une taille de secours bien trop grande à Next.js, qui échouait à l'agrandir depuis une source plus petite. Elles s'affichent maintenant nettes, sur tous les écrans y compris haute densité (Retina, la plupart des téléphones).",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les statistiques (messages, membres, personas) de la page d'accueil d'un monde ne sont plus un bloc de la grille de contenu : elles reprennent une position fixe sous le titre/description, et leur affichage se règle par une simple case à cocher depuis Réglages > Page d'accueil. Le dégradé de la bannière s'étire aussi mieux : il s'estompe désormais en transparence (plus vers une couleur figée), jusqu'au bas du bloc titre, quelle que soit la longueur de la description.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Refonte complète de la page d'accueil d'un monde. La présentation d'abord : toujours pleine largeur (l'ancienne option plein écran a disparu), la bannière passe en fond estompé vers le bas avec les boutons favoris et menu mobile incrustés dessus, le titre et la description deviennent du contenu normal, et l'ensemble du contenu vit dans un panel dédié. Le contenu ensuite : une grille de blocs libre, où chaque bloc (widget, HTML/CSS custom ou Markdown) se place et se redimensionne en largeur depuis Réglages > Page d'accueil, plusieurs blocs pouvant tenir côte à côte sur une même ligne. Glisser la frontière entre deux blocs voisins élargit l'un en rétrécissant l'autre ; la hauteur s'ajuste toute seule au contenu. Certains widgets ont leurs propres réglages (nombre de lignes visibles des salons, nombre d'entrées listées…), et les blocs HTML/Markdown peuvent recevoir un titre qui sert à les repérer dans l'éditeur. Le widget « Annonce » devient un bloc HTML custom parmi d'autres.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Deux nouveaux widgets pour la page d'accueil d'un monde : « Raccourcis wiki » (dernières pages modifiées, lien direct) et « Personas récents » (dernières personas créées, aperçu au clic).",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Nouveau widget « Annonce » pour la page d'accueil d'un monde : un admin peut y écrire du HTML et du CSS libres (3 hauteurs au choix), depuis un nouvel onglet « Page d'accueil » dans les réglages du monde. Le rendu passe par un cadre isolé où aucun script ne peut s'exécuter, quel que soit le contenu saisi.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le bouton pour redescendre en bas d'une chatroom apparaît désormais avec une légère animation (glissement depuis le bas), au lieu d'un simple fondu, et adopte une forme carrée arrondie plutôt que ronde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Une catégorie de chatrooms n'a plus qu'une seule image à gérer (au lieu d'une bannière et d'une icône séparées) — utilisée à la fois pour la grande carte et les petits avatars. Un bouton « Retirer l'image » permet aussi de l'effacer, ce qui était impossible avant pour la bannière.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "En modifiant l'image d'une catégorie de chatrooms, valider le recadrage soumettait aussi le formulaire malgré soi, ce qui enregistrait la catégorie avant la fin du téléversement — la nouvelle image n'était donc jamais prise en compte. Corrigé pour ce sélecteur d'image, utilisé partout dans l'app (avatars, bannières…).",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Modifier une catégorie de chatrooms (titre, description, image) s'enregistrait bien, mais l'affichage ne se mettait pas à jour en temps réel — il fallait recharger la page pour voir le changement.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les catégories de chatrooms s'affichent désormais en grandes cartes avec leur image de bannière et leur description, à la place des petites pastilles avec juste le nombre de sujets.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "La page d'accueil d'un monde devient personnalisable pour les admins, depuis un nouvel onglet « Page d'accueil » dans les réglages du monde : réorganiser ses blocs (catégories, composer, salons) par glisser-déposer, et y ajouter deux nouveaux widgets — statistiques du monde et membres en ligne. L'ordre choisi s'applique à tous les visiteurs du monde.",
  },
  {
    date: "2026-08",
    tag: "Chatrooms",
    text: "Nouveau centre de recherche de messages, accessible depuis l'accueil d'un monde ou l'en-tête d'une chatroom : filtres par salon, auteur (persona ou pseudo), mentions, pièce jointe/lien, date, type d'auteur et épinglé, combinables avec une recherche texte libre.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le niveau, l'XP, les pièces et le streak — liés au compte, pas au personnage — ont été retirés des fiches de persona (profil, édition) et déplacés dans le profil joueur, consultable en cliquant sur un pseudo.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "En changeant de monde, le menu déroulant des conversations dans l'en-tête affichait brièvement l'ancien monde à l'ouverture — il se rafraîchit désormais dès le changement de monde, pas seulement à l'ouverture.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L'avatar d'un membre dans la liste « Membres » d'un monde affiche désormais une pastille de présence (en ligne, absent, hors ligne), comme pour les personas dans une chatroom.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le bouton « Mondes » pointe directement vers ton dernier monde visité (plus besoin de passer par une redirection intermédiaire). Le favori déjà actif (monde ou chatroom en cours) n'est plus cliquable dans la liste et gagne un contour accent, au lieu de renaviguer vers la page déjà affichée.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le bouton « Mondes » de la barre d'icônes principale ramène directement à ton dernier monde visité, et affiche en permanence tes mondes favoris juste en dessous (plus besoin de cliquer pour les voir). Dans le sélecteur de monde de la sidebar, les favoris remontent en tête de liste avec une petite étoile.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le rail des mondes rejoints est temporairement retiré au profit d'un bouton « Mondes » dans la barre d'icônes principale : il déplie sur place tes mondes favoris pour y accéder rapidement.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L'en-tête de la sidebar d'un monde redevient le sélecteur de monde (dropdown avec la liste de tes mondes, créer un monde, quitter…), à la place du simple nom + icône réglages. Le lien « Paramètres » reprend sa place dans le menu de navigation du monde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur mobile, le menu « Insérer un bloc » du composeur s'ouvre désormais en tiroir plein écran : taper un bloc ou une option déplie son aperçu et sa description directement sous lui (avant, ces informations n'étaient visibles qu'au survol sur ordinateur, donc invisibles sur mobile — le choix de couleur des bulles de dialogue en était même inaccessible).",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Dans une chatroom, le bouton pour redescendre en bas de la conversation devenait presque invisible au survol (fond semi-transparent qui laissait apparaître le texte des messages derrière).",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L'animation de chargement des pages (salle, monde, explorateur, admin, boutique) affiche désormais le logo de WVLDS qui pulse, à la place d'une icône générique en rotation.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "La page Explorateur reprend le même en-tête que les pages d'un monde (Membres, Wiki, Réglages…), avec le champ de recherche déplacé à droite, au lieu d'un en-tête différent du reste de l'app.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur écran tactile (mobile, tablette), le menu latéral et les tiroirs de réglages/statistiques/épingles d'une salle s'élargissent un peu plus (jusqu'à 460px au lieu de 360px), quelle que soit la taille de la fenêtre.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le menu d'options d'un message (copier, modifier, épingler, supprimer) affichait toujours du texte en français, même en anglais ou en espagnol.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "L'accueil d'un monde affiche désormais le même en-tête que ses autres pages (Membres, Wiki, Réglages…), avec les actions favoris et plein écran alignées dedans, à la place des boutons flottés sur la bannière.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le bouton « + » de création d'un persona dans l'en-tête de l'onglet Personas d'un monde devient un bouton « Nouveau persona » plus explicite.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Retrait du bouton « Fermer » redondant dans l'en-tête de la carte et du catalogue d'un monde ; le bouton de bascule du mode modification est désormais aligné à droite, comme pour le wiki.",
  },
  {
    date: "2026-08",
    tag: "Mobile",
    text: "WVLDS peut désormais s'installer comme une application depuis le navigateur mobile (icône sur l'écran d'accueil, plein écran sans barre d'adresse) et reste partiellement utilisable hors connexion.",
  },
  {
    date: "2026-08",
    tag: "Social",
    text: "Messages privés : possibilité de modifier ou supprimer ses propres messages, recherche dans l'historique des conversations, et respect des préférences de lecture (police, taille, alignement) déjà réglables dans les paramètres.",
  },
  {
    date: "2026-08",
    tag: "Social",
    text: "Messages privés : indicateur « en train d'écrire » dans une conversation, et chargement progressif de la liste des conversations (au lieu de tout charger d'un coup) en faisant défiler le rail vers la droite.",
  },
  {
    date: "2026-08",
    tag: "Technique",
    text: "Messages privés : un message reçu dans une conversation déjà ouverte ne recharge plus toute la liste des conversations (compteur de non-lus mis à jour localement), et deux index manquants sur les tables de messages/lectures sont ajoutés.",
  },
  {
    date: "2026-08",
    tag: "Social",
    text: "Messages privés : possibilité de bloquer un joueur depuis une conversation. Une personne bloquée ne peut plus vous envoyer de nouveaux messages ni démarrer de nouvelle conversation avec vous, et disparaît de votre recherche — débloquable à tout moment depuis la conversation.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les paramètres d'une chatroom (nom, lieu, catégorie, chronologie) affichent désormais une confirmation à l'enregistrement, là où rien ne le signalait auparavant.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Changer son statut de présence (En ligne/Hors ligne/Invisible) affiche désormais une confirmation, et l'affichage revient à l'ancien statut si l'enregistrement échoue au lieu de rester bloqué sur une valeur non sauvegardée.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Les paramètres d'un monde affichent désormais une confirmation lors de l'enregistrement d'une modification (nom, description, visibilité, nom du lien wiki…), là où rien ne le signalait auparavant.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le lien « Annexes » vers le wiki dans la sidebar d'un monde peut désormais être renommé (ex: « Compendium ») depuis les paramètres du monde, onglet Fonctions.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L'accès aux paramètres d'une salle ne demande plus qu'au moins un message y ait été posté au préalable.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Renommer une page de wiki met désormais à jour en cascade tous les liens internes [[Ancien titre]] qui la ciblent ailleurs dans le monde, au lieu de les laisser cassés silencieusement.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Durcissement de la sécurité des pages de wiki (règle d'écriture) et correction de l'historique des versions qui pouvait manquer une republication à l'identique.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Un lien interne [[Titre]] du wiki partagé par deux pages homonymes pointait arbitrairement vers l'une des deux. Il est désormais rendu comme un lien cassé plutôt que de risquer de pointer vers la mauvaise page.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Retrait du bouton « Fermer » dans l'en-tête du wiki, redondant. Le bouton de bascule du mode modification est désormais aligné à droite de l'en-tête.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Hiérarchie des titres du wiki corrigée : les sous-titres (##, ###…) d'une page rendaient parfois plus gros que le titre de la page elle-même. Le titre de page est agrandi et l'échelle des titres du contenu redéfinie pour rester clairement subordonnée.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "La barre de mise en forme flottante (wiki, messages…) pouvait rester figée à sa position d'avant un défilement au lieu de suivre le texte sélectionné. Elle se recale désormais aussi au scroll et au redimensionnement de la fenêtre.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Une page (ou un dossier) du wiki peut désormais être réservée aux éditeurs du monde — invisible pour les autres membres, utile pour des notes de meneur de jeu. Bascule via le menu ⋯ de la page.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Une page de wiki garde désormais un historique de ses versions publiées : consultez-le via le bouton « Historique » en mode édition pour prévisualiser et restaurer une ancienne version.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "La création d'une page de wiki propose désormais 4 modèles de départ (fiche personnage, lieu, faction, événement historique) en plus d'une page vierge, avec ouverture directe en édition.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Une page de wiki avec au moins deux titres affiche désormais un sommaire cliquable dans la marge, pour sauter directement à une section.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le wiki d'un monde a maintenant une barre de recherche (titre et contenu des pages) et un fil d'Ariane au-dessus de chaque page pour retrouver rapidement son dossier parent.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le wiki d'un monde permet désormais de lier une page à une autre avec la syntaxe « [[Titre de la page]] » : un clic sur le lien affiche directement la page ciblée.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le wiki d'un monde distingue désormais brouillon et contenu publié : les modifications sont autosauvegardées en continu pendant la rédaction, mais ne deviennent visibles des autres membres qu'après avoir cliqué sur « Publier ».",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le wiki d'un monde propose désormais une barre de mise en forme (gras, italique, titres, liste, couleur) pendant la rédaction, et affiche les images insérées en markdown au lieu d'un simple lien.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L'icône d'une salle se choisit désormais avec le même sélecteur que la bannière : glisser-déposer, presse-papiers ou lien externe, avec recadrage carré avant l'enregistrement (au lieu d'un envoi direct sans recadrage).",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Catégories du changelog consolidées : les doublons (« Correctif »/« Corrections », « Personnages »/« Personas ») sont fusionnés et les étiquettes isolées à une seule entrée (« Explorateur », « i18n », « Jeu », « Abonnement », « Profil ») sont regroupées dans la catégorie la plus proche, pour une liste de filtres plus courte et plus lisible.",
  },
  {
    date: "2026-08",
    tag: "Mobile",
    text: "Page du changelog repensée pour les petits écrans : les filtres par catégorie passent en rangée de puces au-dessus de la liste (au lieu d'une colonne fixe qui prenait toute la largeur), et chaque entrée s'affiche désormais sur une seule colonne.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Liste des salles sur l'accueil d'un monde : l'heure du dernier message est désormais toujours affichée (au lieu d'un extrait du texte selon les salles), avec un petit avatar superposé à l'icône pour identifier la dernière personne à avoir écrit.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le texte d'une bulle de dialogue (mode « dialogues en bulles ») ignorait le markdown : **gras**, *italique*, etc. restaient affichés tels quels au lieu d'être interprétés. Corrigé.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur mobile, le bouton menu s'intègre désormais directement dans l'en-tête de chaque page d'un monde (Membres, Personas, Wiki, Catalogue, Carte, Chronologie, Relations, Paramètres) et dans la bannière d'accueil en plein écran, au lieu d'une barre séparée au-dessus.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Cohérence visuelle : rayons d'arrondi uniformisés (`rounded-lg`/`rounded-md`) dans la sidebar d'un monde, les cartes de catégories, le composer, la grille de parties et la carte d'accueil d'un monde ; boutons du header de chatroom et du menu message alignés en taille et en couleur.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le menu mobile affiche désormais un rail avec les icônes de tous vos mondes rejoints, entre le rail d'icônes et la navigation du monde : un tap suffit pour changer de monde, avec une pastille de non-lu superposée sur l'icône si du contenu vous attend. Toujours visible, y compris hors d'un monde et dans une chatroom ; masqué le temps qu'un panneau (messages privés, notifications) occupe l'espace. Le bouton **Monde** de l'ancien rail d'icônes, devenu redondant sur mobile, n'y apparaît plus (conservé sur le rail permanent desktop).",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur mobile, les actions de l'en-tête d'une chatroom (suivre, paramètres, statistiques) sont regroupées dans un menu **⋮** au lieu de trois icônes séparées, pour laisser plus de place au fil de discussion.",
  },
  // ── 2026-07 ──────────────────────────────────────────────────────────────
  {
    date: "2026-07",
    tag: "Comptes",
    text: "Nouvel écran d'accueil pour choisir son pseudo à la première connexion : un simple bouton **« Ajouter un pseudo »** se transforme en champ de saisie au clic, à la place du formulaire précédent.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "La pastille **« nouvelle salle »** d'un monde ne s'effaçait plus correctement : elle disparaissait dès l'affichage de la bannière du monde, même pour les salles que vous n'aviez jamais ouvertes, et pouvait revenir au rechargement. Elle se fonde désormais sur les salles réellement ouvertes — une salle neuve reste signalée tant que vous n'y êtes pas entré.",
  },
  {
    date: "2026-07",
    tag: "Comptes",
    text: "**Connectez votre compte Patreon** depuis vos réglages : si vous êtes mécène actif au palier requis, votre abonnement est activé automatiquement (mondes et personas illimités), et retiré si votre mécénat s'arrête. Vous pouvez délier votre compte à tout moment.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "**Quitter un monde** directement depuis le sélecteur de la sidebar : clic droit sur un monde de la liste puis « Quitter le serveur », avec confirmation. Option indisponible sur les mondes dont vous êtes propriétaire.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Un monde peut être marqué **« réservé aux 18 ans et plus »** dans ses réglages (onglet Fonctions). Toute personne qui rejoint ce monde pour la première fois — depuis l'Explorateur ou une invitation — doit d'abord **indiquer sa date de naissance** et être majeure ; les membres déjà présents devront confirmer à leur prochaine visite si le monde devient 18+ après coup.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le bouton **Rejoindre** d'un monde public dans l'Explorateur ne fonctionnait pas : la fonction serveur qu'il appelait n'avait jamais été déployée, et l'échec restait silencieux. Corrigé, avec un message d'erreur visible en cas de problème.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Cliquez une **carte de monde** dans l'Explorateur pour ouvrir ses statistiques (messages, membres, personas) avant de rejoindre — le bouton **Rejoindre** a été déplacé dans cette fenêtre. Les statistiques ne sont chargées qu'à l'ouverture, pas pour toutes les cartes de la page.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "**Cartes de catégories** sur l'accueil d'un monde, au-dessus du composer : d'un coup d'œil, le nombre de parties par catégorie — cliquez une carte pour filtrer la liste des parties sur cette catégorie. Le filtre reste actif au rechargement de la page et le lien peut se partager.",
  },
  {
    date: "2026-07",
    tag: "Technique",
    text: "Durcissement de la fiche persona et de l'Explorateur suite à une revue de code : le conjoint d'un persona doit désormais appartenir au même monde (contrainte base de données), la limite de 10 tags par monde est appliquée de façon fiable en cas d'insertions concurrentes, le filtre par tags de l'Explorateur ne peut plus dépasser cette limite côté interface, et l'annulation d'un brouillon de composer (fermeture du dialog) annule aussi immédiatement la sauvegarde différée en cours pour éviter qu'elle ne réécrive le brouillon juste après.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "**Statut marital** sur la fiche d'un persona (célibataire, en couple, marié·e, divorcé·e, veuf·ve) : quand le statut implique une relation, choisissez un **conjoint** parmi les autres personas du même monde. Désigner un·e conjoint·e envoie désormais une **notification de demande** au joueur concerné, qui doit la confirmer pour que la relation apparaisse sur les deux fiches (retirer un·e conjoint·e reste immédiat et ne nécessite pas de confirmation).",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Nouvel onglet **« Communauté »** dans les réglages d'un monde : ajoutez jusqu'à 10 **tags** libres pour aider les autres joueurs à le trouver dans l'Explorateur, et indiquez le **type d'avatars accepté** (réels et/ou illustrés). L'Explorateur propose désormais des filtres correspondants, en plus de la recherche par nom/description.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le sélecteur de plan de la page admin **Utilisateurs** ne changeait jamais réellement le plan d'un compte : le menu déroulant ne soumettait rien au changement de valeur. Il applique désormais le nouveau plan immédiatement.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "**Barre de mise en forme flottante** : sélectionnez du texte dans le composer (ou en éditant un message) pour faire apparaître une petite barre au-dessus — gras, italique, barré, souligné, liste, titre (H1/H2/H3) et couleur de texte, appliqués sans taper le markdown à la main. Nouveau marqueur `[#ff0000]texte[/]` pour la couleur et `++texte++` pour le souligné.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "**Alignement du texte des chatrooms** : troisième réglage de la carte « Accessibilité » (avec police et taille du texte) — choisissez entre texte **ferré à gauche** (par défaut) et **justifié**.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Nouveau bloc **Choix** dans le composer : proposez un choix sous forme de cartes (question optionnelle + 2 à 9 options) que les autres joueurs peuvent voter — l'auteur ne peut pas voter sur son propre choix, les résultats se mettent à jour en temps réel pour tout le monde.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Nouvelle option **avertissement de contenu** dans le composer : ajoutez des étiquettes libres (violence, deuil…) affichées en tête du message pour prévenir les joueurs de ce qu'il contient avant de le lire.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "**Suivre un persona** depuis sa fiche : un bouton « Suivre » notifie les abonnés quand ce persona crée une nouvelle chatroom ou y répond, dans un monde.",
  },
  {
    date: "2026-07",
    tag: "Performance",
    text: "La quasi-totalité des images de l'app (avatars, bannières, icônes de mondes/salons/objets, cadres, apparences de personas) passe désormais par l'optimiseur d'images de Next.js : redimensionnement et formats modernes automatiques, chargement différé hors écran, et réservation d'espace pour éviter les sauts de mise en page. Quelques cas restent volontairement en `<img>` classique (aperçus locaux avant upload, images intégrées via URL externe dans le markdown, carte du monde). Par ailleurs, les onglets d'un monde (wiki, réglages, relations, catalogue, carte, chronologie, membres), les panneaux DMs/notifications et plusieurs boîtes de dialogue peu utilisées ne sont désormais chargés qu'à l'ouverture au lieu d'alourdir chaque page ; certaines requêtes redondantes (infos du monde, utilisateur courant, feature flags) ont été dédupliquées ; et un indicateur de chargement s'affiche désormais pendant la navigation vers les pages monde, salon, découverte, personas, boutique et admin. Sur les pages monde et salon, cet indicateur ne couvre plus que la zone de contenu (accueil du monde ou messages) : la sidebar du monde (sélecteur, navigation, liste des salons) reste visible et utilisable pendant ce chargement au lieu de disparaître avec le reste de la page.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Les **catégories de chatrooms** peuvent désormais avoir une image dédiée (recadrable en carré), en plus de la bannière, depuis le dialog de création/édition dans les réglages du monde. Elle s'affiche à la place de l'initiale partout où la catégorie apparaît en petit format : sidebar, sélecteur de catégorie du composer et des réglages d'un salon.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Après une coupure réseau, la présence (« en ligne »), les messages, les notifications et les messages privés pouvaient rester bloqués sur « hors ligne » même une fois la connexion revenue, obligeant à recharger la page. Tous les canaux temps réel de l'app se reconnectent désormais automatiquement au retour de la connexion.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le lien **« Catalogue »** de la sidebar d'un monde n'apparaissait que si l'inventaire ou les compétences étaient restreints — il ignorait les faceclaims, et disparaissait donc pour la plupart des mondes. Il s'affiche désormais dès qu'au moins une des trois fonctionnalités (objets, compétences, faceclaims) est activée. Corrige au passage un bug plus ancien : les colonnes d'activation individuelle de l'inventaire et des compétences par monde n'avaient jamais été appliquées en base, ce qui rendait ces deux réglages inopérants.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "**Faceclaims** : un persona peut désormais indiquer, juste à droite de son nom (\"ft. …\"), l'acteur ou le personnage sur lequel son avatar est basé — pratique pour éviter les doublons dans un même monde. Un nouvel onglet **« Faceclaims »** dans le Catalogue du monde liste, triés alphabétiquement, tous les faceclaims déclarés. La fonctionnalité est activée par défaut et peut être désactivée dans les réglages du monde (le champ et l'onglet disparaissent alors).",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Nouveau champ de fiche persona **« Liste descriptive »** : une série de paires titre/description alignées façon glossaire, où la colonne des titres s'ajuste automatiquement au plus long d'entre eux pour que toutes les descriptions démarrent au même niveau.",
  },
  {
    date: "2026-07",
    tag: "Performance",
    text: "Requêtes en double supprimées au chargement de l'accueil (`/`), de la page Personas et des réglages : elles refaisaient une vérification d'authentification et/ou une lecture de profil déjà résolues par le layout de la requête, au lieu de réutiliser ce résultat.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "**Confort de lecture des chatrooms** : dans les réglages du profil, deux nouveaux réglages avec cartes d'aperçu — la **police** du texte des messages (Sans serif par défaut, Serif, ou **Adapté dyslexie** avec OpenDyslexic) et la **taille du texte** (Petit, Normal, Grand).",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Un membre au rôle « spectateur » qui réagissait à un post ne déclenchait aucune notification pour l'auteur : la réaction elle-même était rejetée silencieusement (règle de sécurité limitée aux rôles joueur et plus). Tout membre du monde peut désormais réagir, quel que soit son rôle.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Ouvrir la catégorie « Général » dans la sidebar d'un monde affichait « Aucune chatroom dans cette catégorie » alors que le compteur annonçait bien des sujets — les chatrooms non catégorisées n'étaient jamais retrouvées lors de l'ouverture du détail, seulement dans le compteur.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "**Couleur des bulles de dialogue liée au persona** : choisir une couleur dans le composeur (mode « Dialogues en bulles ») l'associe désormais au persona actif — elle est proposée automatiquement à chaque nouveau message de ce persona, dans n'importe quelle chatroom. La couleur reste modifiable en éditant un message existant dont l'option dialogue est cochée. Une surcharge ponctuelle est aussi possible directement dans le texte, en ajoutant le code hexadécimal juste après les guillemets fermants : `\"Bonjour !\"{#ff0000}`.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Cohérence de la fiche lors d'un déplacement ou d'une duplication vers un monde avec fiche par défaut :\n- **Sortir un persona d'un monde libère les verrous** hérités de sa fiche par défaut — ils n'ont de sens que pour ce monde\n- **Entrer dans un monde avec une fiche par défaut remplace entièrement la fiche** du persona par le modèle du monde (sections, champs, y compris verrous) — une boîte de dialogue prévient avant que cela ne se produise, pour déplacer ou dupliquer en connaissance de cause",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Correctifs issus de la revue de code de la page Personas :\n- La page **/p affiche désormais les mondes rejoints (et leurs zones de dépôt) même sans aucun persona** — un nouveau membre invité voyait auparavant un état vide sans accès au glisser-déposer\n- Le **quota de personas est maintenant garanti au niveau base de données lors d'un déplacement** entre mondes (plus seulement à la création) — deux déplacements simultanés ne peuvent plus dépasser la limite\n- Éditer un persona depuis /p applique désormais les **restrictions de catalogue de son monde** (inventaire/compétences), comme depuis la page du monde\n- Lors d'une duplication, un échec de copie d'image abandonne l'image plutôt que de partager le fichier de l'original (dont la suppression aurait cassé la copie)\n- Les erreurs d'activation de la fiche par défaut sont traduites en clair",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Correction d'une rare condition de course dans les providers de notifications et de messages privés : un clic vers une salle survenant dans la même frame qu'une mise à jour de l'état pouvait lire une liste périmée (et par exemple ne pas archiver une notification tout juste affichée). Les références internes sont désormais synchronisées au rendu et plus dans un effet différé.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "**Champs verrouillés de la fiche par défaut** : dans l'éditeur de la fiche modèle d'un monde, chaque champ peut être **verrouillé** (icône cadenas au survol). Les champs verrouillés sont copiés sur les fiches des nouveaux personas et y sont **impossibles à supprimer** (la section qui les contient aussi) — le contenu reste bien sûr modifiable par le joueur. La règle est garantie côté base de données, pas seulement à l'écran. Dupliquer un persona produit en revanche une copie entièrement libre.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "La sidebar de navigation d'un monde affiche un lien **Paramètres** (visible par le propriétaire et les admins) qui ouvre directement le panneau de réglages du monde — plus besoin de passer par la page d'accueil du monde.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "**Fiche de persona par défaut** : dans les paramètres d'un monde, une nouvelle option « Fiche par défaut » permet de définir une fiche modèle (sections et champs) avec l'éditeur habituel — chaque persona créé dans le monde démarre avec une copie de cette structure (les grilles d'images du modèle sont copiées vides). La fiche modèle ne compte pas dans le quota de personas, et sa désactivation la supprime sans toucher aux personas déjà créés.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "La page Personas gagne deux nouveautés :\n- Les cartes se **déplacent au glisser-déposer** entre les mondes (ou vers « Sans monde ») — au dépôt, une boîte de confirmation propose de **déplacer** le persona ou d'en créer une **copie exacte** (fiche, sections, images comprises), dans la limite du quota de personas du monde cible\n- Deux vues au choix : **par monde** (comme avant) ou **alphabétique** tous mondes confondus, avec le nom du monde rappelé sous chaque carte\n- Les refus sont expliqués clairement (quota du monde cible atteint, nom déjà utilisé dans le monde cible) au lieu d'une erreur technique\n- Les mondes rejoints **sans persona** apparaissent aussi, avec une zone « Dépose un persona ici » — on peut donc y déplacer ou dupliquer un persona directement\n- Le compteur « x / 5 » n'apparaît plus pour les comptes abonnés (personas illimités)",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Sur mobile, le tiroir de navigation gardait une largeur pleine (jusqu'à 360px) même sans panneau contextuel à afficher (pages Personas, Boutique...) — il se réduit désormais à la largeur du rail d'icônes dans ce cas.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le panneau « Mes mondes » (liste des mondes rejoints avec leurs salons) s'affichait sur toutes les pages sauf celles d'un monde ou d'une chatroom (Explore, Personas, Boutique, Admin...) — il n'y avait pas sa place et faisait doublon avec la navigation déjà présente dans les pages de monde. Il a été retiré entièrement.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le rail d'icônes de navigation (à gauche) débordait sur les fenêtres de faible hauteur (moins de ~620px), rendant certaines icônes inaccessibles — la zone de navigation défile désormais indépendamment, le bouton menu et le pied (messages privés, notifications, avatar) restant toujours visibles.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Le sélecteur de persona du composer passe d'une grille à une **liste triée par ordre alphabétique**, avatar à gauche et nom bien lisible :\n- Une **étoile** à droite de chaque ligne permet de marquer un persona en **favori** — les favoris remontent automatiquement en tête de liste (toujours alphabétiques entre eux)\n- Les favoris sont mémorisés par joueur (stockage local), sans configuration supplémentaire",
  },
  {
    date: "2026-07",
    tag: "Technique",
    text: "Refonte des compteurs de non-lus (badges de mondes et de salles) pour la performance :\n- Les compteurs sont désormais **entretenus localement** (incrément à la réception d'un message, remise à zéro à la lecture) au lieu de redemander un recomptage complet au serveur à chaque événement — **zéro requête réseau** en régime permanent\n- Le badge d'un monde est **dérivé** des compteurs de ses salles (une seule source de vérité, plus de double comptage possible)\n- Un seul canal temps réel multiplexé pour les messages de tous les mondes, au lieu d'un canal par monde\n- Une resynchronisation complète est déclenchée au retour sur l'onglet (au plus une fois par minute) pour rattraper une éventuelle dérive due à un autre appareil\n- La logique « marquer la salle comme lue » et l'archivage des notifications sont mutualisés (moins de code dupliqué, comportement identique partout)",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Les notifications de réponse en chatroom se comportaient mal dans deux cas : une notification arrivait même lorsqu'on était déjà dans la salle concernée, et naviguer vers une salle ne supprimait pas les notifications existantes. Ces deux scénarios sont désormais corrigés : toute notification liée à la salle ouverte est archivée immédiatement, que ce soit à l'entrée dans la salle ou à la réception en temps réel.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le pseudo affiché entre parenthèses sous un message (@pseudo) affichait **@?** pendant un bref instant à l'envoi, le temps que le message envoyé en optimiste ne connaisse pas encore son auteur complet — il utilise désormais le pseudo déjà connu du joueur en attendant.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Refonte du menu blocs/options du composer :\n- Les **blocs à créer** (dé, bannière, encadré, ancre, révélation…) et les **options à cocher** (dialogues en bulles, SMS, chronologie, lieu, note privée) sont désormais dans deux sections distinctes\n- Chaque ligne affiche une **courte description**, et le survol/focus met à jour un **panneau d'aperçu** à droite montrant à quoi ressemble le bloc ou l'option activée\n- Sur mobile, le panneau d'aperçu est masqué pour garder le menu utilisable en largeur réduite",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Sur mobile, la touche Entrée du composer créait un envoi immédiat sans possibilité pratique de revenir à la ligne (Maj+Entrée n'est pas accessible sur un clavier virtuel) :\n- Sur mobile désormais, **Entrée crée un nouveau paragraphe** et **Maj+Entrée ou Ctrl+Entrée envoie** le message (ou le bouton d'envoi)\n- Le comportement sur ordinateur (Entrée envoie, Maj/Ctrl+Entrée revient à la ligne) reste inchangé",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Messages « SMS » :\n- Nouvelle option à cocher dans le composer (persistante jusqu'à décochage) qui affiche les messages envoyés en **bulles façon SMS**, sans le header habituel (nom, avatar, date)\n- Les messages SMS envoyés à la suite sont **regroupés dans un même bloc**, comme un lancé de dé ou une bannière — bulle alignée à droite pour ses propres messages, à gauche pour celles des autres, petit avatar au bout, boutons éditer/supprimer à l'opposé\n- Pour des messages consécutifs du même auteur, l'**avatar ne se répète plus** (affiché une seule fois, sur la dernière bulle) et les **coins de raccord se resserrent** entre les bulles, façon Messenger\n- Décocher l'option en éditant un message SMS le fait redevenir un message normal une fois sauvegardé",
  },
  {
    date: "2026-07",
    tag: "Social",
    text: "Profil joueur personnalisable :\n- **Bio** (500 caractères max) et **pronoms** (jusqu'à 3, choisis dans une liste prédéfinie ou saisis librement) éditables depuis **Paramètres**\n- Nouvelle **carte profil** au clic sur l'avatar **ou** sur le pseudo (`@pseudo`) du joueur dans un message de chatroom : pseudo, statut de présence, pronoms, bio et date d'inscription\n- Distincte du profil de persona existant (fiche de personnage) — ici il s'agit du compte joueur lui-même",
  },
  {
    date: "2026-07",
    tag: "Performance",
    text: "Fusion des requêtes de démarrage (notifications, messages privés, badges non-lus) :\n- Nouvelle RPC `get_app_shell()` qui regroupe en **un seul aller-retour** ce qui prenait jusqu'à 6 requêtes séparées au montage (mondes rejoints, compteurs non-lus par monde et par salon, préférences de notification, notifications récentes, conversations privées)\n- `NotificationsProvider` et `DmsProvider` montent dans deux branches différentes de l'arbre de composants et démarraient donc chacun leur propre appel réseau : ils **partagent désormais la même requête en vol**, quel que soit celui qui démarre en premier\n- Les rafraîchissements ciblés (après un message reçu en Realtime) restent inchangés — ils ne rechargent que les compteurs concernés, pas tout le bootstrap",
  },
  {
    date: "2026-07",
    tag: "Performance",
    text: "Moins de requêtes au chargement d'un chatroom :\n- Les liens de navigation du monde (`?view=…`) et le globe du rail ne **préfetchent plus** leur page — chaque chargement déclenchait jusqu'à 18 rendus serveur inutiles (pages dynamiques jamais mises en cache, lien `/w` répondant par une redirection)\n- Le **défi du jour et son statut « gagné » sont chargés en une seule requête** (tentatives embarquées) au lieu de deux en cascade\n- Correctif au passage : un défi gagné par **un autre joueur** était marqué comme déjà gagné pour soi (la policy « read won » rend les victoires publiques, le filtre `user_id` manquait)\n- Meta description du site remplacée (texte du starter Supabase)",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Correction d'un bug de session partagée entre comptes :\n- Après une déconnexion, le cookie `last_world_id` restait actif — à la reconnexion avec un autre compte, l'application redirigait vers le monde de la session précédente, potentiellement inaccessible\n- `app/page.tsx` vérifie désormais via la base (RLS) que l'utilisateur courant a bien accès au monde retenu avant de le rediriger\n- Le middleware efface aussi le cookie lors des redirections vers `/auth/login` (sessions expirées ou déconnexion depuis un autre onglet)",
  },
  {
    date: "2026-07",
    tag: "Technique",
    text: "Correction des 27 tests automatisés échouant depuis l'ajout de i18n :\n- Les composants `ChatroomComposer`, `CreateWorldButton` et `NotificationInlinePanelContent` utilisent `useTranslations()` (next-intl) mais les tests unitaires n'avaient pas de `NextIntlClientProvider` — tous les rendus plantaient\n- Un mock global de `next-intl` dans la configuration de test lit les vraies traductions `fr.json` et implémente `t()`, `t.rich()` (interpolation ICU avec composants React) et `t.has()` sans contexte React\n- Correction au passage : le bouton « Retour » du panel notifications utilisait `aria-label=\"Notifications\"` (copie du titre) au lieu de `\"Retour\"`, la clé `back` a été ajoutée",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "La barre de mise en forme flottante du composer apparaissait mal placée dans le dialog de création d'une chatroom depuis la page d'un monde : le centrage du dialog (`translate`) redéfinissait le repère de positionnement de la barre (`position: fixed`), décalant ses coordonnées calculées depuis la sélection. La barre est désormais rendue directement dans `document.body`, quel que soit le composeur qui l'affiche.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Fermer le dialog de création d'une chatroom (depuis la page d'un monde) ne vidait jamais réellement le composer, y compris en confirmant l'abandon du brouillon : le texte revenait à la prochaine ouverture, restauré depuis le brouillon toujours présent en local. Toute fermeture du dialog (avec ou sans confirmation) vide désormais le composer et supprime son brouillon local.",
  },
  // ── 2026-06 ──────────────────────────────────────────────────────────────
  {
    date: "2026-06",
    tag: "Performance",
    text: "Chargement des pages plus rapide (rendu serveur) :\n- L'identité, le profil et les *feature flags* sont désormais **résolus une seule fois par requête** (mémoïsation `React cache()`) et partagés entre le layout racine, le layout protégé, le rail et la sidebar du monde\n- Avant, le rendu d'une page monde refaisait ~3 validations réseau de session (`getUser`), 3-4 lectures de profil et 2-3 lectures de flags, **en série** — principal responsable de la latence au chargement\n- Les validations de session passent par les *claims* locaux du JWT (déjà validé par le middleware), sans aller-retour réseau",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Navigation mobile :\n- Un **menu latéral** (drawer) s'ouvre depuis l'en-tête sur mobile, regroupant le rail d'icônes et le panneau actif (notifications, messages privés, ou navigation du monde)\n- La **sidebar du monde** (sélecteur, navigation, chatrooms) est désormais accessible sur mobile via ce drawer\n- Fermeture automatique du drawer à la navigation\n- Aucun changement sur desktop",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Correction des pages de connexion/inscription qui ne s'affichaient plus :\n- Les pages `/auth/*` étaient hors du contexte de traduction (`NextIntlClientProvider`), ce qui faisait planter les formulaires utilisant `useTranslations`\n- Le contexte i18n est désormais aussi fourni sur l'espace d'authentification",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Réduction des requêtes réseau au chargement :\n- **Profil courant partagé par contexte** : id, pseudo, avatar, plan et statut « hors-ligne » sont résolus **une seule fois côté serveur** et diffusés via un `CurrentUserProvider`. Avant, chaque composant refaisait son propre `auth.getUser()` + `select` sur `profiles` — soit ~6 requêtes `/auth/v1/user` et plusieurs `profiles?select=…` identiques par page\n- Plus aucun `getUser()` réseau au démarrage : la session est lue depuis le stockage local (`INITIAL_SESSION`)\n- Les variantes de `select` sur le profil (pseudo, avatar, plan, appear_offline) sont **mutualisées** : la barre latérale, la présence et le canal de chatroom lisent le contexte au lieu de re-fetcher\n- **Marquage « lu » dédoublonné** : l'ouverture d'une chatroom ne déclenche plus deux écritures `chatroom_reads` ni deux recalculs de compteurs non-lus\n- Aucun changement d'API pour les composants : le hook `useCurrentUser()` est inchangé",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Traduction de l'interface :\n- Support de **3 langues** : Français, English, Español\n- Détection automatique via la langue du navigateur (`Accept-Language`)\n- Préférence sauvegardée dans le profil (synchronisation entre appareils)\n- Sélecteur de langue dans **Paramètres** (`/settings`)\n- Nouveau lien « Paramètres » dans le menu utilisateur\n- Page admin `/admin/translations` : tableau de couverture par namespace, alerte sur les clés manquantes\n- Architecture `next-intl` sans routing — les URLs restent inchangées",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Catalogue des mondes publics :\n- Nouvelle page `/explore` : grille paginée (16 par page) de tous les mondes dont la visibilité est **publique**\n- **Recherche** par nom et description avec debounce 300 ms\n- Bouton **Rejoindre** directement depuis la carte (role `player` attribué automatiquement) ; bouton **Entrer** si déjà membre\n- Icône Boussole dans le rail de navigation (visible uniquement si le flag `public_worlds` est actif)\n- Les owners peuvent basculer leur monde en public/privé depuis les paramètres du monde (section Visibilité)\n- Activable via le flag admin `public_worlds`",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Défis quotidiens :\n- Chaque joueur reçoit **son propre défi aléatoire** chaque jour — personne n'a le même\n- 7 types de défis : mot imposé, mot interdit, longueur précise (100–350 mots), incipit imposé, question finale, sans adverbe en -ment, motif regex\n- Un badge apparaît sur le message gagnant dans le chatroom, avec tooltip markdown affichant les détails du défi\n- Journal des victoires anonymisé sur la page `/quests` (aucun pseudo ni chatroom révélé)\n- Défis générés au chargement de `/quests` s'ils n'existent pas encore pour la journée\n- Le « Mot du jour » reste une option parmi les 17 défis possibles (même probabilité que les autres)\n- Désactivable via le flag admin `quests`",
  },
  {
    date: "2026-06",
    tag: "Social",
    text: "Amélioration de la messagerie privée :\n- **Pagination automatique** : les anciens messages se chargent en faisant défiler vers le haut (30 par batch), sans déplacer la position de lecture\n- **Scroll instantané en bas** à l'ouverture d'une conversation (plus d'animation de défilement)\n- Correction d'un bug de **conversations en doublon** dans le rail (race condition dans `find_or_create_dm`, maintenant atomique via `INSERT … ON CONFLICT DO NOTHING`)",
  },
  {
    date: "2026-06",
    tag: "Technique",
    text: "Consolidation UI notifications et messages privés :\n- Tout le code UI des **notifications** (`NotificationPanel`, boutons cloche/sidebar, contexte panel) est désormais dans un seul fichier `components/notifications/index.tsx`\n- Tout le code UI des **messages privés** (panel, rail épinglés, bouton toggle) est dans `components/dms/index.tsx`\n- `NotificationsProvider` gère directement l'état ouvert/fermé du panel (plus de contexte séparé)\n- Exclusivité mutuelle notifs ↔ DMs assurée par `AppShell` via deux `useEffect`",
  },
  {
    date: "2026-06",
    tag: "Social",
    text: "Messages privés entre joueurs :\n- **Rail de conversations** : avatars scrollables (drag) en haut du panel, badge non-lus, pastille de présence\n- **Conversation** : bulles de messages, statut en ligne/absent, nombre de mondes en commun affiché sous le pseudo\n- **Nouvelle conversation** : cliquez sur + dans le rail, ou sur l'icône message dans la fiche Membres d'un monde\n- Désactivable via le flag admin `direct_messages`",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Sidebar monde — sections chatrooms redessinées :\n- **ACTIF** : les 5 chatrooms les plus récentes dans lesquelles vous avez participé, avec nom de catégorie affiché sous le titre\n- **SUIVIS** : nouvelle fonctionnalité de suivi — cliquez sur l'étoile ★ dans l'entête d'un chatroom pour l'épingler ici\n- **TOUS** : chatrooms groupées par catégorie (Général pour celles sans catégorie)",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Refonte du layout global :\n- **Rail permanent 48px** toujours visible a gauche : avatar/menu utilisateur, cloche (notifs), icone Messages prives (placeholder), separateur, icones des mondes avec popover chatrooms au survol, bouton creer un monde\n- **Panneau global** (notifs ou DMs) qui s'ouvre en poussant le contenu principal -- une seule vue a la fois\n- **Sidebar interne aux mondes** : navigation (Membres, Annexes, Persona, Relations, Carte, Chronologie, Catalogue) + liste des chatrooms groupee en ACTIF / TOUS avec badge de non-lus -- visible sur `/w/[id]` et `/c/[id]`\n- **Sidebar accueil** : liste des mondes avec liens rapides (Membres, Wiki, Relations) et chatrooms recentes participees, visible sur la page d'accueil `/home`\n- Les vues plein ecran du monde (Wiki, Carte, Relations, Catalogue, Chronologie, Paramètres, Membres) sont desormais pilotees par le paramètre URL `?view=X` -- la sidebar les ouvre directement via des liens\n- Suppression de l'ancien rail d'icones droit dans les pages monde",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Consolidation des politiques de sécurité (RLS) et nettoyage d'index :\n- **9 groupes de politiques** qui se recoupaient sur le même rôle et la même action ont été fusionnés en une seule politique équivalente (moins d'évaluations par requête, à accès strictement identiques) — touche notamment la lecture des mondes, des chatrooms, des personas et des invitations\n- Suppression de **3 index redondants** (doublons exacts) sur `chatroom_persona_prefs`, `profiles` et `world_content_tabs` — moins de travail d'écriture en base, aucune perte de garantie d'unicité\n- Les chevauchements entre rôles différents ont volontairement été laissés intacts pour ne prendre aucun risque sur les droits d'accès\n- Migration `039_rls_consolidate_policies_and_dup_indexes.sql` (atomique, rollback complet documenté)",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Optimisation des politiques de sécurité (RLS) de la base :\n- Les **105 politiques** qui évaluaient `auth.uid()` **à chaque ligne** lue le font désormais **une seule fois par requête** (enveloppe `(select auth.uid())`), correction recommandée par l'analyseur de performance de Supabase\n- Aucun changement de comportement ni de sécurité : seules les *quelles lignes sont visibles* restent identiques, seul le moment d'évaluation change\n- Bénéficie à toutes les pages qui lisent des données protégées (mondes, chatrooms, personas, inventaire, wiki…), avec un gain qui croît avec le volume de données\n- Migration `038_rls_initplan_optimization.sql` (idempotente, avec rollback documenté)",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Chargement plus rapide des pages **Personas** (/p), **Monde** (/w) et **Chatroom** (/c) :\n- L'identité de l'utilisateur est désormais lue depuis le JWT déjà validé par le middleware (`getClaims`) au lieu de revalider la session via un appel réseau (`getUser`) à chaque page — un aller-retour réseau économisé partout (nouveau helper `lib/auth.ts`)\n- Les requêtes indépendantes sont **exécutées en parallèle** au lieu d'être enchaînées : la page Monde charge en une fois la navigation des salons, les droits admin, les préférences et les personas ; la page Chatroom charge en deux vagues parallèles (salon + messages + clé + persona, puis réactions + navigation + rôle) ; la page Personas charge les sections et les noms de mondes simultanément\n- Aucun changement fonctionnel visible : uniquement une réduction de la latence de rendu serveur",
  },
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
    tag: "Correctif",
    text: "Correction d'un **404 à l'ouverture d'un monde** (avec disparition de la sidebar) :\n- En cause : le middleware réécrivait la réponse sur les routes `/w/...` sans recopier les cookies de session rafraîchis, ce qui faisait paraître l'utilisateur déconnecté côté serveur — la page ne trouvait alors plus le monde et renvoyait un 404, même pour des mondes accessibles. La session est désormais préservée sur toutes les routes monde\n- Nettoyage de mondes hérités restés **sans propriétaire** (créés avant le câblage de l'ownership), qui étaient inaccessibles à tous\n- La colonne `owner_id` des mondes est désormais **obligatoire** (NOT NULL), empêchant qu'un monde puisse à nouveau exister sans propriétaire",
  },
  {
    date: "2026-06",
    tag: "Correctif",
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
    tag: "Personas",
    text: "Toile des relations dans les mondes :\n- Nouveau canvas accessible depuis l'icône Réseau (⊕) dans le rail latéral du monde\n- Blocs utilisateurs en pointillés, déplaçables librement sur le canvas — positions persistées par joueur et par monde\n- Cartes personas colorées par **groupe** (défini par le propriétaire du monde : nom + couleur) ; chaque joueur peut assigner ses propres personas à un groupe\n- **Relations directionnelles** : la flèche indique le sens déclaré par l'auteur\n- Si A→B et B→A existent avec le **même type** : double flèche (↔) sur un chemin unique\n- Si A→B et B→A existent avec des **types différents** : deux courbes décalées en parallèle avec un séparateur **/** au milieu, chacune de sa couleur\n- **6 types de relations** avec style de flèche distinct : Allié, Ennemi, Rival, Amant, Famille, Inconnu\n- **Description markdown** par relation, saisie au moment de la création ou éditée en ligne dans le panneau latéral\n- **Panneau persona** (gauche) : cliquer une carte affiche toutes ses relations sortantes et reçues, avec description éditable et bouton supprimer\n- **Mode lien** activable via le bouton « Créer un lien » dans la barre d'outils — en mode normal, cliquer une carte ouvre le panneau persona\n- Survol d'un lien : badge type + bouton Supprimer apparaissent au milieu de la flèche\n- **Permissions** : un joueur ne peut créer/supprimer que ses propres relations (depuis ses propres personas) ; les admins gardent un accès complet\n- **Types de relation dynamiques** : le propriétaire du monde peut créer, éditer et supprimer des types personnalisés (nom, couleur, style de trait) via le bouton Paramètres ; deux types par défaut (Allié et Ennemi) sont créés automatiquement\n- **Couleur de groupe dans les chatrooms** : le nom d'un persona apparaît dans la couleur de son groupe dans les messages des chatrooms du même monde",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Mondes favoris dans la sidebar :\n- Épingler un monde avec l'icône ★ sur sa bannière\n- Section **Mondes favoris** en haut de la sidebar, avec les 3 dernières chatrooms actives sous chaque monde favori\n- Pastille d'activité sur les chatrooms non lues\n- En mode rail (sidebar réduite) : survol d'une icône de monde affiche un popover avec le nom du monde et les chatrooms favorites récentes",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Préférences d'affichage par monde (persistées) :\n- **Aside redimensionnable** — glisser le séparateur vertical pour ajuster la largeur de la colonne personas (150–380 px)\n- **Mode plein écran** — icône sur la bannière du monde pour basculer entre contenu centré (max-w) et plein écran\n- Préférences sauvegardées par utilisateur et par monde dans `world_user_preferences`",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Les personas sont maintenant liés à un monde :\n- Chaque monde possède ses propres personas (jusqu'à 5 par compte gratuit)\n- Panneau **Personas** intégré à gauche dans la page d'un monde : créer, visualiser et éditer ses personnages sans quitter le monde\n- Page `/p` refaite en vue globale : tous les personas regroupés par monde avec lien direct vers le monde\n- Sur mobile, les personas sont accessibles via le bouton dédié dans le rail latéral",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Nouvelles options pour les encadrés :\n- **Jauges** — jusqu'à N barres nommées avec valeur actuelle / max et couleur personnalisable parmi 8 presets ; remplacent les anciens blocs « Jauge de vie »\n- **Image comme icône** — uploader une image depuis le bucket du chatroom pour l'utiliser à la place d'un emoji ou d'une icône ; l'image est liée aux médias du message et nettoyée à la suppression",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Dix blocs disponibles dans l'éditeur de profil des personnages :\n- **Titre** et **Bloc de texte** (markdown)\n- **Stats** — valeurs chiffrées avec unité, en grille adaptative\n- **Inventaire** — objets avec icône RPG, quantité et description au survol\n- **Compétences** — icône RPG, nom, niveau libre et description\n- **Jauges** — barres de progression avec valeur, max et couleur personnalisable\n- **Citation** — blockquote markdown avec source optionnelle\n- **Traits** — pills de personnalité\n- **Timeline** — chronologie avec date libre et description repliable\n- **Séparateur** et **Grille d'images**\n\nPlus de 4 100 icônes SVG issues de game-icons.net, sélectionnables via un picker avec recherche.",
  },
  {
    date: "2026-06",
    tag: "Personas",
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
    tag: "Personas",
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
    tag: "Personas",
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
