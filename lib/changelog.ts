export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  // ── 2026-09 ──────────────────────────────────────────────────────────────
  {
    date: "2026-09",
    tag: "Membres",
    text: "« Ma carte dans ce monde » (présentation, disponibilités, fuseau, anniversaire, statut) se règle dans « Mon profil », sous le pseudo, dès que l’on se trouve dans un monde ou dans l’un de ses salons — plus depuis l’en-tête de la liste des membres. Le profil d’un membre, ouvert depuis ce monde, montre sa carte après sa présentation, ses pronoms et son niveau.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "La barre de la liste des personas se resserre : la recherche, un seul menu « Filtres » (joueur, groupe, statut, type, fiche — la valeur en regard de chaque entrée, un compteur sur le bouton) et le tri. Les filtres actifs s’affichent en pastilles que l’on retire d’un clic.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Un administrateur d’un monde (permission « Régler le monde ») peut activer, modifier et désactiver la fiche de persona par défaut, comme le propriétaire — la bascule répondait « L’enregistrement a échoué ».",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Une compétence peut exiger des prérequis, d’autres compétences du catalogue choisies dans son éditeur. Sa fiche les liste et dit ce qu’elle débloque ; dans un monde qui restreint les compétences au catalogue, une compétence ne s’ajoute à une fiche de persona qu’une fois ses prérequis présents — le sélecteur grise les autres et nomme ce qui manque, et une compétence dont un prérequis a disparu le signale.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Un objet peut se composer d’autres objets : sa recette se règle dans son éditeur (ingrédients et quantités) et sa fiche la montre en arbre dépliable — composition des composants comprise — ainsi que les objets dans la fabrication desquels il entre. Aucune mécanique d’inventaire : c’est une fiche, pas un atelier.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Chaque objet et chaque compétence a une vraie fiche, ouverte d’un clic depuis le catalogue comme depuis l’inventaire ou les compétences d’un persona : description en Markdown (avec les [[liens]] du wiki), rareté, propriétés, et des pages du wiki liées — choisies dans l’éditeur de l’objet, dix au plus — qui mènent au wiki du monde.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Une catégorie du catalogue a une présentation : une description (Markdown) et une bannière, affichées en tête quand on la déplie. Elles se règlent depuis le crayon de la catégorie, avec son nom.",
  },
  {
    date: "2026-09",
    tag: "Notifications",
    text: "Deux notifications pour les fiches de persona, chacune avec son réglage : « Fiches soumises à validation » prévient les relecteurs d’un monde, « Relecture de mes fiches » prévient le joueur quand sa fiche est validée ou renvoyée (le commentaire du relecteur en aperçu). Elles ouvrent directement la fiche concernée, et arrivent aussi en notification push.",
  },
  {
    date: "2026-09",
    tag: "Rôles",
    text: "Trois permissions de plus dans le groupe Personas des rôles : « Valider les fiches », « Gérer les PNJ » et « Jouer les PNJ ». Le rôle Administrateur les a d’office.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "Les membres d’un monde lisent la fiche complète — sections et champs — des personas du monde, depuis la liste des personas comme depuis un salon.",
  },
  {
    date: "2026-09",
    tag: "Salons",
    text: "Quand un persona ne peut pas être choisi pour écrire, le sélecteur et le bouton d’envoi disent pourquoi : fiche incomplète, fiche non validée, quota du plan gratuit, ou PNJ sans la permission de le jouer.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "Chaque persona tient un journal de bord, onglet Journal de sa fiche : des entrées en Markdown que son joueur écrit (ou, pour un PNJ, qui le joue) et que tous les membres du monde lisent. Quand le monde a une chronologie, une entrée se date dans celle-ci et le journal se range dans l’ordre du monde.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "PNJ partagés : un persona du monde que plusieurs membres font parler. Deux permissions le régissent — « Gérer les PNJ » (créer, modifier, supprimer ; case « PNJ partagé » à la création, section PNJ de la liste avec son bouton) et « Jouer les PNJ » (le choisir dans le sélecteur du salon, sous « PNJ du monde »). Les messages disent « PNJ · joué par @pseudo ». Un PNJ ne compte pas dans le quota de personas, naît validé, et un monde en compte trente au plus.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "Le modèle de fiche d’un monde peut rendre des champs obligatoires (l’astérisque, dans les réglages du modèle). La validation des fiches est une option de la fiche par défaut, à activer dans les réglages du monde ; avec elle, une fiche naît en brouillon : son éditeur liste ce qui manque, propose d’ajouter les champs du modèle absents, et le bouton « Soumettre à validation » s’active une fois la fiche complète. Un administrateur — permission « Valider les fiches » — la valide ou la renvoie avec un commentaire depuis l’onglet Relecture de la fiche ; chacun est prévenu par notification. Seules les fiches validées et complètes jouent dans les salons ; un badge (incomplète, brouillon, en relecture) le dit sur les tuiles, et la liste des personas se filtre par état de fiche. Les fiches des personas d’un monde sont désormais lisibles par ses membres.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "Un persona a un statut narratif — vivant, disparu, décédé, retiré — réglé depuis sa fiche et visible partout : tuiles grisées avec badge, fiche, en-tête des messages, canevas des relations (où un bouton de la légende masque les retirés et décédés). La liste des personas d’un monde se cherche et se filtre par joueur, groupe de relations et statut, et se trie par nom ou par date.",
  },
  {
    date: "2026-09",
    tag: "Rôles",
    text: "Les images d’un monde suivent la permission de ce qu’elles illustrent : image de catégorie avec « Gérer les catégories », icône ou bannière de salon pour son créateur ou « Gérer les salons des autres », image du wiki avec « Modifier le wiki », carte et lieux avec « Modifier la carte », objets du catalogue avec « Modifier le catalogue ».",
  },
  {
    date: "2026-09",
    tag: "Membres",
    text: "Sur la carte d’un membre, le nombre de messages et la dernière prise de parole s’affichent en icônes à droite du nom, et les personas au-delà des quatre premiers se résument en pastille « +N » au bout de la rangée — le détail au survol.",
  },
  {
    date: "2026-09",
    tag: "Salons",
    text: "Tapez @ dans un salon pour mentionner un membre, un rôle (« @Maître du jeu »), @tous ou @ici (les membres présents), avec une liste de propositions sous le curseur. Les mentions s’affichent en puces colorées, chaque personne visée reçoit une notification — une seule par message, même mentionnée plusieurs fois — et deux réglages de notification distincts couvrent les rôles et les @tous. Un rôle se rend « mentionnable par tous » dans les réglages ; sinon il faut la permission.",
  },
  {
    date: "2026-09",
    tag: "Membres",
    text: "Chaque membre a une carte propre au monde — présentation, disponibilités, fuseau horaire (les autres voient l’heure qu’il est chez lui), anniversaire — et un statut : actif, en pause ou absent jusqu’à une date. Le statut se voit sur sa carte et sur ses personas ; un gestionnaire peut le régler pour un membre. La carte montre aussi le nombre de messages et la dernière prise de parole dans le monde. Un bloc d’accueil « Anniversaires » liste ceux qui approchent.",
  },
  {
    date: "2026-09",
    tag: "Rôles",
    text: "Les rôles d’un monde se créent dans ses réglages : nom, couleur, icône, et une liste de permissions à cocher (écrire, créer des salons, modifier le wiki, la carte, le catalogue, gérer les membres…). Un membre peut en cumuler plusieurs. Les rôles se classent en hiérarchie : on ne gère que ceux situés sous le sien, et l’on ne confère que ce que l’on possède. Chaque monde part avec Administrateur, Éditeur, Joueur et Spectateur.",
  },
  {
    date: "2026-09",
    tag: "Membres",
    text: "Sur l’onglet Membres, les rôles s’attribuent depuis le menu de chaque carte, qui sert aussi à retirer un membre ; la liste se groupe par plus haut rôle. Le dialogue d’invitation propose un rôle ou les rôles par défaut du monde.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Quand l’envoi de l’image d’une catégorie échoue, le recadrage reste affiché avec un message au lieu de se refermer sur une case vide, et l’envoi ne dépend plus de la vérification de session qu’un autre onglet pouvait bloquer.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "L’application ne se recharge plus toute seule quand le navigateur signale un retour en ligne : un formulaire en cours, comme une image de catégorie envoyée mais pas encore enregistrée, n’est plus perdu.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Dans l’éditeur de la page d’accueil, un clic dans les réglages d’un bloc ne démarre plus un déplacement de ce bloc.",
  },
  {
    date: "2026-09",
    tag: "Page d’accueil",
    text: "Le bloc « Membres en ligne » a un réglage d’affichage : la rangée d’avatars, ou une liste avec le nom de chaque membre. Sa hauteur est alignée sur celle du bloc « Créer une partie ».",
  },
  {
    date: "2026-09",
    tag: "Membres",
    text: "L’onglet Membres d’un monde se présente en cartes, regroupées par rôle : avatar, statut en ligne et les personas joués, chacun cliquable pour ouvrir sa fiche. Un champ de recherche filtre par nom de membre ou de persona ; le compteur « en ligne », à côté, ne garde que les membres connectés d’un clic.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Sous Firefox, avec l’application ouverte dans plusieurs onglets, l’envoi d’une image (icône ou bannière d’un monde, d’une salle ou d’un persona, image de carte ou de lieu, bannière de page d’accueil, image du wiki, capture d’un signalement) pouvait ne jamais partir. Il ne dépend plus de la vérification de session qu’un autre onglet pouvait bloquer ; la création d’un monde non plus.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Au retour sur l’application après un moment en arrière-plan, la connexion temps réel est rouverte à neuf : le statut en ligne des membres, les messages et les notifications repartent aussitôt.",
  },
  {
    date: "2026-09",
    tag: "Relations",
    text: "Une relation se crée dans un dialogue — de qui, vers qui, quel type, une description — plus besoin du mode « lien » à deux clics. Le type et la description se modifient sur place, et une demande en attente se voit en pointillé.",
  },
  {
    date: "2026-09",
    tag: "Relations",
    text: "La légende du canevas filtre : cliquez un type ou un groupe pour ne garder que lui à l’écran. Le nombre de demandes qui vous attendent s’affiche en haut.",
  },
  {
    date: "2026-09",
    tag: "Mobile",
    text: "Sur petit écran, les personas se présentent en cartes, une rangée par joueur à faire défiler de droite à gauche, avec le nombre de relations et les demandes en attente ; le détail d’un persona est le même qu’en grand écran, ajout compris.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "La fiche d’un persona a un onglet « Relations » : ce qu’il pense des autres, ce qu’on pense de lui. Une demande en attente s’y accepte ou s’y refuse, un couple s’y rompt.",
  },
  {
    date: "2026-09",
    tag: "Relations",
    text: "Un type de relation peut être réciproque : la relation attend l’accord du joueur d’en face, qui reçoit une notification, puis existe dans les deux sens. Les autres types restent l’opinion d’un seul persona.",
  },
  {
    date: "2026-09",
    tag: "Relations",
    text: "Le couple et le mariage sont désormais des relations réciproques comme les autres : désigner un·e conjoint·e depuis la fiche envoie la demande, l’accepter écrit les deux fiches, rompre les libère toutes les deux.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Changer le type ou la description d’une relation depuis le canevas ne s’enregistrait jamais, sans qu’aucune erreur ne le dise. C’est corrigé.",
  },
  {
    date: "2026-09",
    tag: "Personas",
    text: "Les propriétés d’un objet ou d’une compétence du catalogue — poids, portée, prérequis… — se lisent aussi sur la fiche du persona qui le porte.",
  },
  {
    date: "2026-09",
    tag: "Technique",
    text: "L’image d’un objet du catalogue ne peut être qu’une adresse en http(s), vérifiée en base comme les autres images.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Un objet ou une compétence se crée dans le même dialogue que sa modification : image, icônes, rareté et propriétés dès la création. « Créer et continuer » enchaîne les saisies sans le refermer.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Chaque ligne du catalogue a son menu : modifier, dupliquer, déplacer vers une catégorie, supprimer. Plus besoin de glisser un objet pour le classer.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Cochez plusieurs objets pour les déplacer, changer leur rareté ou les envoyer à la corbeille d’un coup.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Les catégories se replient d’un clic et affichent leur nombre d’entrées ; le repli est retenu d’une visite à l’autre.",
  },
  {
    date: "2026-09",
    tag: "Accueil",
    text: "Une fois le titre d’un monde défilé, une barre reste en haut de la page : son nom sur sa bannière floutée, avec le menu, la recherche et le bouton favori toujours à portée.",
  },
  {
    date: "2026-09",
    tag: "Technique",
    text: "Ce que vous saisissez est vérifié une fois de plus, côté serveur : les adresses d’images ne peuvent être qu’en http(s), les couleurs qu’au format hexadécimal, et chaque champ a une longueur maximale. Un envoi qui ne respecte pas ces règles est refusé avec un message clair au lieu d’une erreur technique.",
  },
  {
    date: "2026-09",
    tag: "Emoji",
    text: "Le sélecteur d’emoji prend les couleurs de l’application : onglets de catégories en icônes maison, celui en cours à l’accent, et un cadre identique aux autres menus.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "L’outil règle joint deux lieux : cliquez l’un puis l’autre, et un trait les relie. Il porte un nom, si vous lui en donnez un, et la distance dès que la carte est à l’échelle. La fiche d’un lieu montre en petit ce qu’il rejoint.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Depuis la fiche d’un lieu, « M’installer ici » pose un de vos personas à cet endroit, et une croix l’en fait repartir. C’est là que se règle désormais l’emplacement d’un persona, et non plus dans sa propre fiche.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "La fiche d’un lieu dit sur quelle carte et dans quelle région il se trouve, et range ses informations en blocs distincts.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Les lieux portent leur nom en permanence sur la carte. Deux noms qui se recouvriraient : seul l’un des deux s’affiche, et l’autre reparaît en agrandissant.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Un lieu s’ouvre désormais dans la colonne, à côté de la carte, au lieu d’une fenêtre posée dessus : la carte reste entière sous les yeux, et la fiche a la place de tout montrer.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Une corbeille : un objet supprimé y reste trente jours. Le restaurer le rend d’un coup à toutes les fiches qui le portaient.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Une compétence peut porter une icône choisie parmi celles de l’application, ou une image — les icônes de jeu de rôle allaient mal à « Diplomatie » ou « Survie ».",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Un cadenas sur chaque onglet dit si le catalogue est restreint ou en saisie libre, et l’explique au survol.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Un objet du catalogue porte désormais une image, une rareté, un plafond par fiche et des propriétés libres — poids, portée, prérequis.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Renommer un objet du catalogue le renomme partout où il est porté. Un objet supprimé est signalé dans les fiches, au lieu d’y rester sous son ancien nom.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Le catalogue se cherche par nom ou par description, et le choix d’un objet depuis une fiche montre les catégories du monde.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Un objet se duplique d’un clic, et le nombre de personnages qui le portent s’affiche à côté de son nom.",
  },
  {
    date: "2026-09",
    tag: "Catalogue",
    text: "Le catalogue d’un monde s’exporte dans un fichier et s’importe dans un autre, ses catégories avec lui.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Une image de carte peut peser jusqu’à 60 Mo : de quoi importer un export en pleine résolution. Les formats acceptés sont nommés d’emblée : JPEG, PNG, GIF ou WebP.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le nom d’une carte se corrige dans son onglet, d’un double-clic, et ses commandes — changer l’image, supprimer — tiennent dans un menu au bout de celui-ci.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Supprimer un lieu demande confirmation.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le tracé d’une région se suit à l’œil : le contour accompagne la souris, le premier sommet la referme d’un clic, et le retour arrière défait le dernier point.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le panneau d’un lieu porte son titre et « Jouer ici » sur sa bannière, sa description juste en dessous, et l’écrit plus petit.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Des régions sur la carte : en édition, un outil de tracé pose les sommets d’un royaume, d’une forêt, d’une mer. Chaque région a un nom, une couleur, une description et une page du wiki, et ses sommets se déplacent après coup.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "« [[lieu:Le port]] » dans un message ou une page du wiki devient un lien qui ouvre la carte sur ce lieu. L’éditeur du wiki propose les lieux dès qu’on tape [[lieu:.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Les lieux dans le temps : dans un monde à chronologie, un lieu prend une date de fondation et de disparition, et la carte affiche une époque — ce qui n’existe pas alors s’estompe.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "L’échelle d’une carte se règle en traçant un segment sur une distance connue et en disant ce qu’elle vaut. Une barre d’échelle paraît alors dans le coin.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Un persona peut se situer sur un lieu depuis sa fiche. La carte compte alors qui s’y trouve, et le panneau du lieu les nomme.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Les lieux posés ou déplacés par d’autres apparaissent désormais sans recharger la page.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "« Jouer ici » : depuis un lieu de la carte, le composeur s’ouvre situé sur ce lieu.",
  },
  {
    date: "2026-09",
    tag: "Salons",
    text: "Le centre de recherche fouille aussi les lieux de la carte, et ouvre la carte dessus.",
  },
  {
    date: "2026-09",
    tag: "Accueil",
    text: "Un bloc « Carte » à placer sur l’accueil d’un monde : la carte en vignette, ses onglets, et le nombre de lieux.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "La carte se tient mieux sur téléphone : la liste des lieux s’y ouvre en tiroir, qu’on referme d’un balayage, l’en-tête garde ses commandes, et les épingles sont plus faciles à viser du doigt.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "La page d’un lieu mène à sa position sur la carte, quand une épingle la raconte.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Une liste des lieux s’ouvre depuis l’en-tête. Sa recherche traverse toutes les cartes du monde, et choisir un lieu y mène — la carte se centre dessus.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le panneau d’un lieu liste les salons qui s’y jouent.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Une épingle peut ouvrir une autre carte : le lieu « Capitale » posé sur le continent mène au plan de la ville. Un repère signale les lieux qui mènent ailleurs.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Les onglets des cartes se réordonnent par glisser-déposer, à la souris comme au clavier.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "L’adresse suit la carte ouverte et le lieu consulté : le lien se partage, le bouton Précédent revient à la carte d’avant, et un rafraîchissement rouvre au même endroit.",
  },
  {
    date: "2026-09",
    tag: "Performance",
    text: "La carte gagne en netteté par paliers à mesure qu’on zoome, au lieu de télécharger l’image d’origine d’un coup.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Un monde peut avoir plusieurs cartes — le continent, la capitale, un donjon — présentées en onglets. Avec une seule, rien ne change : elle occupe tout le cadre.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "La carte remplit toujours son cadre, quelle que soit la forme de l’écran : plus de bandes vides autour, et le zoom va jusqu’à 6×.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le panneau d’un lieu s’ouvre au-dessus de son épingle — en dessous s’il n’y a pas la place — avec une flèche qui la désigne.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Les lieux de la carte s’atteignent au clavier : tabulation pour les parcourir, Entrée pour ouvrir, Échap pour refermer.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le pincement à deux doigts agrandit la carte sur mobile, et la déplacer ne fait plus défiler la page.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le panneau d’un lieu suit son épingle quand on déplace ou agrandit la carte.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Le nom de la carte se modifie depuis son en-tête, comme celui du wiki.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Une épingle que l’on vient de poser n’apparaît plus en double.",
  },
  {
    date: "2026-09",
    tag: "Performance",
    text: "La carte d’un monde s’ouvre sans attente et reste fluide sous le zoom, même chargée d’épingles.",
  },
  {
    date: "2026-09",
    tag: "Carte",
    text: "Une épingle de la carte peut renvoyer à une page du wiki : on la choisit en modifiant l’épingle, et un bouton l’ouvre depuis la carte."
  },
  {
    date: "2026-09",
    tag: "Salons",
    text: "Un lien « [[Page]] » écrit dans un message ouvre la page du wiki du monde."
  },
  {
    date: "2026-09",
    tag: "Salons",
    text: "Le centre de recherche fouille aussi le wiki du monde : les pages et fiches trouvées s’affichent avant les messages."
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Les pages, les fiches de notes et leurs catégories se réordonnent aussi depuis leur menu, sans souris."
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Une page supprimée part dans une corbeille, avec ses fiches, ses commentaires et ses images. Un éditeur la restaure ou l’efface pour de bon ; elle est retirée d’elle-même après trente jours.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Un bouton de la colonne des pages liste les modifications récentes. Les éditeurs y voient aussi les brouillons en attente.",
  },
  {
    date: "2026-09",
    tag: "Performance",
    text: "La recherche du wiki et l’arbre des pages restent fluides sur un monde fourni.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "La recherche du wiki fouille aussi les fiches de notes. Choisir une fiche ouvre la colonne dessus.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "L’adresse suit la page lue : le lien se partage, le bouton Précédent revient à la page d’avant, et un rafraîchissement rouvre au même endroit.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Taper « # » après un titre de page propose ses sections.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Un lien interne peut viser une section : « [[Arkham#Le port]] », ou « [[#Le port]] » dans la page courante.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Cliquer une image d’un article l’ouvre en grand, dans la visionneuse des salons.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Survoler un lien interne affiche un aperçu de la page visée : icône, description et bannière.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Le menu ⋯ d’une page permet de la monter, de la descendre, de la ranger dans le dossier au-dessus ou de l’en sortir, sans glisser-déposer.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "Se déconnecter n’affiche plus « Session expirée », et le bouton de déconnexion fonctionne aussi en navigation privée.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Les images d’un article sont rangées avec leur page : supprimer la page supprime ses images.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Une image se colle ou se dépose directement dans un article, à l’endroit du curseur.",
  },
  {
    date: "2026-09",
    tag: "Wiki",
    text: "Écrire « [[ » dans un article propose les pages du monde ; Entrée complète le lien.",
  },
  {
    date: "2026-09",
    tag: "Correctif",
    text: "La barre d’outils du wiki encadre à nouveau le texte sélectionné, en laissant les espaces hors des marqueurs.",
  },
  {
    date: "2026-09",
    tag: "Nouveauté",
    text: "« Signaler un problème » dans votre menu : décrivez le souci, joignez jusqu’à trois captures d’écran et, si l’application a planté, la trace d’erreur proposée par le formulaire. La page où vous étiez et votre navigateur sont joints automatiquement. La même page liste vos signalements et leur avancement ; les administrateurs disposent d’une file de tri.",
  },

  // ── 2026-08 ──────────────────────────────────────────────────────────────
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Les colonnes du wiki se retirent d’elles-mêmes quand la place manque ; un bouton les rouvre en tiroir.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sur téléphone, saisir la poignée d’une page ou d’une fiche du wiki refermait le tiroir.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Glisser une page, une fiche ou une catégorie du wiki affiche un aperçu flottant et ouvre l’emplacement où elle se posera.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Une page peut être posée juste avant ou juste après un dossier sans y entrer : les bords de la ligne du dossier placent devant ou derrière, son milieu fait entrer.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Une page du wiki peut être sortie d’un dossier par glisser-déposer. Un dossier ne peut plus être glissé dans son propre contenu.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "L’éditeur d’article défile avec la page entière, bannière comprise ; ses commandes restent dans un pied fixe.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "La bannière d’une page se recadre avant l’envoi et s’affiche en écriture comme en lecture.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Le sommaire disparaît : l’article occupe toute la colonne.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Une page peut s’ouvrir sur une bannière, avec l’icône, le titre et la description par-dessus. La description est limitée à 255 caractères.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Sur écran étroit, l’aperçu de l’éditeur remplace la saisie au lieu de la flanquer. Le titre s’aligne sur le texte, l’icône au-dessus.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sur écran étroit, l’article était coupé à droite en mode modification.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Chaque bloc d’un article porte dans sa marge un bouton pour commenter et le nombre de discussions en cours.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Un commentaire vise un bloc entier (paragraphe, élément de liste, citation, titre) et le suit quand le texte bouge. Les commentaires existants sont conservés.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Ctrl+Z annule aussi une mise en forme dans l’éditeur d’article.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "L’article s’écrit en markdown coloré, avec une barre d’outils (titres, gras, italique, souligné, barré, code, lien, listes, citation) et ses raccourcis clavier.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Les boutons de création du panneau de notes passent en pied de colonne.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "La colonne des notes restait masquée en mode modification, et réordonner une page par glisser-déposer échouait.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Le wiki s’adapte aux écrans étroits : l’arbre des pages et la colonne des notes s’ouvrent en tiroirs, l’article prend toute la largeur.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "La colonne des commentaires et des notes se redimensionne à la poignée ; sa largeur est retenue par monde.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Confirmer la suppression d’un commentaire ou d’une page de wiki figeait l’application.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Le wiki ouvre sa première page à l’arrivée. Notes et commentaires partagent une colonne à droite, avec deux onglets.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Une page de wiki a ses notes : des fiches classées par catégories (vue d’ensemble, entités, lieux… ou les vôtres), réorganisables, repliables, en markdown. Les éditeurs du monde les écrivent, les membres les lisent.",
  },
  {
    date: "2026-08",
    tag: "Wiki",
    text: "Une page de wiki se commente : sélectionnez un passage, répondez dans la colonne de droite, marquez le fil comme résolu. Les commentaires suivent le texte quand il change et arrivent en temps réel.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Une fiche sans onglet propose de créer le premier en un clic : Informations, Apparence, Histoire ou un autre nom.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "Les champs de code de l’éditeur de blocs se colorent dès l’affichage.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le bloc HTML de la page d’accueil a un onglet pour le balisage et un pour le style, avec coloration syntaxique et aperçu exact. Il s’affiche dans la page, hérite de ses polices et couleurs, et sa hauteur suit son contenu. Votre CSS ne s’applique qu’au bloc ; aucun script ne peut s’exécuter.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Les blocs HTML et Markdown acceptent une hauteur fixe ; un contenu plus grand défile à l’intérieur.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "L’accueil d’un monde clignotait au chargement sur mobile.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Dans l’éditeur de persona, la description d’une liste descriptive revient à la ligne et accepte les retours à la ligne. Les listes descriptives s’affichent titre puis description.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les images se chargent sur une version floutée d’elles-mêmes plutôt que sur un carré gris.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les images recadrées (avatars, bannières, icônes) perdent moins de qualité, et les avatars sont nets sur les écrans à forte densité.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Les « sections » d’une fiche s’appellent désormais des « onglets », et cette partie de l’éditeur est traduite en anglais et en espagnol.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Sur mobile, les boutons de l’éditeur de fiche sont visibles en permanence, et le bloc de texte s’ajuste à son contenu.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le recadrage d’une bannière de persona correspond aux proportions affichées.",
  },
  {
    date: "2026-08",
    tag: "Chatrooms",
    text: "Clic droit ou appui long sur une bulle de dialogue : « Copier la couleur de dialogue ». Ouvrir un profil depuis un message n’ouvre plus le menu du message.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "La fiche d’édition a un bouton « Aperçu » qui montre la fiche telle qu’elle apparaît depuis une chatroom. Les panneaux de profil et d’édition se ferment en balayant ou en cliquant à côté.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Cliquer la pastille « Couleur de dialogue » d’une fiche copie son code hexadécimal.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Une fiche sans section affiche un profil vide plutôt qu’un message.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Les onglets d’un profil passent en soulignement, restent épinglés en haut au défilement et défilent horizontalement sur mobile.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Changer la bannière d’un persona puis rouvrir sa fiche affichait l’ancienne.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "Les images d’une galerie se redimensionnent à la poignée, se déplacent d’une ligne à l’autre et peuvent afficher un fond. Elles gardent leurs proportions.",
  },
  {
    date: "2026-08",
    tag: "Personas",
    text: "La fiche d’un persona affiche sa couleur de dialogue et son cadre d’avatar ; la bannière s’estompe vers le bas.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les pastilles de présence affichaient tout le monde hors ligne.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Accessibilité : les textes gris pâle repassent au contraste requis ; les commandes qui n’apparaissaient qu’au survol se montrent aussi au clavier ; l’arbre du wiki se parcourt au clavier ; les boutons et liens réduits à une icône portent un libellé traduit ; la barre latérale annonce le monde courant aux lecteurs d’écran.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les cartes de l’Explorateur restent carrées quelle que soit la largeur d’écran.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les messages d’erreur s’affichent dans votre langue, y compris à la connexion et à l’inscription ; le détail technique reste côté serveur. Session expirée, quota atteint, nom déjà pris et droits insuffisants ont chacun leur message.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "La fenêtre de confirmation de suppression suit la langue choisie.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Un message épinglé ancien ne peut plus apparaître dans le mauvais salon.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’application est entièrement traduite en anglais et en espagnol ; seules les mentions légales restent en français.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Changer de salon juste après en avoir créé un ne peut plus chiffrer un message avec la mauvaise clé.",
  },
  {
    date: "2026-08",
    tag: "Nouveauté",
    text: "La carte et le wiki d’un monde peuvent être désactivés depuis Paramètres → Fonctions. Rien n’est supprimé.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’appui long tolère un léger tremblement du doigt sur téléphone.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Se déconnecter coupe les notifications sur cet appareil.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "La recherche ignore les accents, et la liste des salons proposée après « dans: » est classée par ordre alphabétique.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les très longs messages partent désormais, jusqu’à la limite de 200 000 caractères.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sur téléphone, la fiche d’un lieu de la carte reste dans l’écran.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les images envoyées portent un nom imprévisible, sans le nom du fichier d’origine.",
  },
  {
    date: "2026-08",
    tag: "Technique",
    text: "Ménage interne : code dupliqué regroupé, dépendances figées, base de données entièrement décrite dans le projet, tests couvrant toutes les pages de l’espace connecté.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les votes des blocs « choix » ne sont visibles que par les membres du monde.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Faille fermée : certaines opérations privilégiées (blocage, récompenses, conversations) pouvaient être détournées.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Après un retour de connexion, les messages ne s’affichent plus en double.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "La liste des salons n’ouvre qu’une seule connexion temps réel, et le premier lancement précharge moins d’images.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Failles fermées sur les fichiers : on ne peut plus écraser l’avatar ou la bannière d’un persona d’autrui, ni l’icône, la bannière ou les images d’un salon sans en avoir le droit. Les espaces de stockage n’acceptent que des images de taille raisonnable.",
  },
  {
    date: "2026-08",
    tag: "Technique",
    text: "Les textes sont bornés côté base, très au-dessus d’une saisie normale.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Toutes les écritures vérifient leur résultat. Supprimer une bannière, activer les notifications push, refuser une invitation ou une demande de mariage, les bascules d’administration, les préférences, le réordonnancement du catalogue et du wiki, l’assignation d’un groupe et l’étoile « salon suivi » signalent un échec au lieu d’afficher un succès.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "L’expiration des défis est réservée aux tâches planifiées ; deux achats simultanés ne peuvent plus rendre le solde négatif ; un défi relevé deux fois n’est plus crédité en double.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les récompenses de message exigent un message réel, écrit par le compte qui les réclame.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Faille fermée dans les invitations de monde : créer une invitation exige d’être administrateur, son rôle n’est plus modifiable après envoi, et elle ne peut plus conférer la propriété. L’invitation par courriel fonctionne et apparaît dans les notifications de l’invité.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "En changeant de salon ou de monde, les épingles, les étoiles, les badges de défi, la liste des salons et la catégorie sélectionnée ne gardent plus l’état du précédent.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les clés de chiffrement des salons ne sont lisibles que par les membres du monde ; les profils et le détail des votes exigent d’être connecté.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les onglets du navigateur portent le nom du salon, du monde ou de la section.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Une erreur imprévue affiche un écran propre, avec « Réessayer », un retour à l’accueil et un code d’erreur.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Joindre des images à un message ne consomme plus de mémoire à chaque caractère tapé.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "Plusieurs images s’envoient en parallèle.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "Explorateur, page des personas, boutique, page de connexion et accueil d’un monde chargent avec moins de requêtes ; les blocs « Personas récentes », « Raccourcis wiki » et « Catégories » arrivent avec la page.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "Déchiffrement des messages accéléré.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "L’onglet « Membres » ne télécharge plus les messages du monde pour lister les personas, et n’en oublie plus.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "Un message reçu dans un autre monde ne rafraîchit plus toute la page du salon.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les tentatives de défis réussies ne sont visibles que par les membres du monde.",
  },
  {
    date: "2026-08",
    tag: "Performance",
    text: "Pages de monde et de salon allégées : navigation, droits, profil et personas ne sont chargés qu’une fois et seulement où ils servent. La présence ne rafraîchit que les bulles concernées, et les outils du composeur ne sont téléchargés qu’à l’ouverture.",
  },
  {
    date: "2026-08",
    tag: "Technique",
    text: "Base de données durcie : fonctions épinglées et règles de sécurité évaluées une fois par requête.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les marges de la page d’accueil d’un monde se réduisent sur petit écran.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le bloc Catégories s’affiche en liste compacte à côté d’un autre bloc, en étagère de cartes quand il occupe toute la largeur.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sur mobile, le bouton menu reste accessible pendant le chargement d’une page.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Dans la Chronologie, les salons sont regroupés par mois.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "La Toile des relations a une recherche par nom de persona ou pseudo de joueur, et une vue mobile en liste groupée par joueur.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Dans l’éditeur de grille, les boutons d’un bloc restent visibles sur écran tactile et réagissent au clic.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sur mobile, les onglets Paramètres et Catalogue ont le même fond que les autres.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Nouveau bloc « Bannière » pour la page d’accueil : titre, texte, image de fond et bouton. Les blocs HTML et Markdown peuvent s’afficher pleine largeur, sans cadre.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Un grillage de 12 colonnes s’affiche pendant le déplacement d’un bloc.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Nouveau widget « Raccourcis chronologie » : un calendrier des salons datés. Chaque mois du calendrier d’un monde a son propre nombre de jours (Réglages → Fonctions → Chronologie).",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le bloc « Raccourcis wiki » affiche l’heure dans la langue courante ; « Membres en ligne » ne charge que les membres en ligne.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’espacement entre les blocs de la page d’accueil se règle (compact, confortable, spacieux). Sur mobile, glisser un bloc ne fait plus défiler la page.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "L’éditeur de grille affiche exactement la disposition finale ; étirer la frontière entre deux colonnes redimensionne les deux blocs.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Les icônes de monde et les images de catégorie s’affichent nettes sur tous les écrans.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les statistiques d’un monde reprennent une position fixe sous le titre, activables par une case à cocher.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Refonte de la page d’accueil d’un monde : bannière en fond estompé, contenu pleine largeur, et une grille de blocs libres (widgets, HTML, Markdown) placés et redimensionnés depuis Réglages → Page d’accueil.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Lexique du monde dans le wiki : des termes définis par un admin, mis en évidence dans le contenu, avec leur description au clic.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Widgets « Raccourcis wiki », « Personas récents » et « Annonce » (HTML et CSS libres, sans script) pour la page d’accueil d’un monde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le bouton pour redescendre en bas d’une chatroom glisse depuis le bas et prend une forme carrée arrondie. Il reste lisible au survol.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Une catégorie de chatrooms n’a plus qu’une image, avec un bouton pour la retirer. Les catégories s’affichent en grandes cartes avec image et description.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Modifier une catégorie de chatrooms se reflète sans recharger, et valider le recadrage de son image ne soumet plus le formulaire avant la fin de l’envoi.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "La page d’accueil d’un monde se personnalise depuis Réglages → Page d’accueil : blocs réordonnables, widgets statistiques et membres en ligne.",
  },
  {
    date: "2026-08",
    tag: "Chatrooms",
    text: "Centre de recherche de messages : filtres par salon, auteur, mentions, pièce jointe, date, type d’auteur et épinglé, combinables avec une recherche texte.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le niveau, l’XP, les pièces et le streak passent de la fiche de persona au profil joueur.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le menu des conversations de l’en-tête se rafraîchit au changement de monde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les membres d’un monde ont une pastille de présence.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Le bouton « Mondes » de la barre d’icônes ramène à votre dernier monde visité et affiche vos favoris ; les favoris remontent en tête du sélecteur. Le rail des mondes est temporairement retiré.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’en-tête de la sidebar redevient le sélecteur de monde ; « Paramètres » revient dans la navigation du monde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur mobile, le menu « Insérer un bloc » s’ouvre en tiroir plein écran, avec aperçu et description de chaque bloc.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’animation de chargement affiche le logo WVLDS.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’Explorateur et l’accueil d’un monde reprennent l’en-tête des autres pages de monde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur écran tactile, le menu latéral et les tiroirs s’élargissent jusqu’à 460 px.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le menu d’options d’un message est traduit.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le bouton « + » de l’onglet Personas devient « Nouveau persona ».",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le bouton « Fermer » disparaît des en-têtes du wiki, de la carte et du catalogue ; la bascule du mode modification est alignée à droite.",
  },
  {
    date: "2026-08",
    tag: "Mobile",
    text: "WVLDS s’installe comme une application depuis le navigateur mobile, et reste partiellement utilisable hors connexion.",
  },
  {
    date: "2026-08",
    tag: "Social",
    text: "Messages privés : modifier ou supprimer ses messages, recherche dans l’historique, préférences de lecture, indicateur « en train d’écrire », chargement progressif des conversations, et blocage d’un joueur depuis une conversation.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les paramètres d’une chatroom, ceux d’un monde et le statut de présence confirment l’enregistrement.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le lien « Annexes » vers le wiki peut être renommé depuis Paramètres → Fonctions.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Les paramètres d’une salle sont accessibles avant le premier message.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Renommer une page de wiki met à jour les liens [[…]] qui la ciblent. Un lien ambigu entre deux pages homonymes est rendu cassé.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Sécurité des pages de wiki durcie ; l’historique ne manque plus une republication à l’identique.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Hiérarchie des titres du wiki corrigée : les sous-titres restent plus petits que le titre de la page.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "La barre de mise en forme flottante suit le texte au défilement et au redimensionnement.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Une page ou un dossier du wiki peut être réservé aux éditeurs du monde (menu ⋯).",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Une page de wiki garde l’historique de ses versions publiées, avec aperçu et restauration.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Quatre modèles de page à la création : personnage, lieu, faction, événement.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le wiki gagne un sommaire cliquable dès deux titres, une barre de recherche et un fil d’Ariane.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Liens internes entre pages avec « [[Titre de la page]] ».",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le wiki distingue brouillon et publication : autosauvegarde pendant la rédaction, visible des autres après « Publier ».",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Barre de mise en forme dans le wiki ; les images markdown s’affichent.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "L’icône d’une salle se choisit avec le même sélecteur que la bannière, avec recadrage carré.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Catégories du changelog consolidées, et page adaptée aux petits écrans.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Liste des salles : l’heure du dernier message est toujours affichée, avec l’avatar du dernier auteur.",
  },
  {
    date: "2026-08",
    tag: "Correctif",
    text: "Le markdown est interprété dans les bulles de dialogue.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur mobile, le bouton menu s’intègre à l’en-tête de chaque page d’un monde.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Arrondis et boutons uniformisés dans la sidebar, les cartes, le composeur et l’en-tête de chatroom.",
  },
  {
    date: "2026-08",
    tag: "Mondes",
    text: "Le menu mobile affiche un rail de vos mondes rejoints, avec une pastille de non-lu.",
  },
  {
    date: "2026-08",
    tag: "Interface",
    text: "Sur mobile, les actions de l’en-tête d’une chatroom sont regroupées dans un menu ⋮.",
  },

  // ── 2026-07 ──────────────────────────────────────────────────────────────
  {
    date: "2026-07",
    tag: "Comptes",
    text: "Nouvel écran de choix du pseudo à la première connexion.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "La pastille « nouvelle salle » reste tant que vous n’avez pas ouvert la salle.",
  },
  {
    date: "2026-07",
    tag: "Comptes",
    text: "Connectez votre compte Patreon depuis vos réglages : l’abonnement s’active si vous êtes mécène au palier requis, et se retire si le mécénat s’arrête.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Quitter un monde depuis le sélecteur de la sidebar (clic droit), sauf pour ses propriétaires.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Un monde peut être réservé aux 18 ans et plus : la date de naissance est demandée à l’entrée.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le bouton Rejoindre de l’Explorateur fonctionne.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Cliquer une carte de monde dans l’Explorateur ouvre ses statistiques et le bouton Rejoindre.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Cartes de catégories sur l’accueil d’un monde : un clic filtre les parties, et le filtre se partage par lien.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Statut marital et conjoint sur la fiche d’un persona ; le joueur du conjoint reçoit une demande à confirmer.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Onglet « Communauté » dans les réglages : jusqu’à 10 tags et type d’avatars accepté, filtrables dans l’Explorateur.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le sélecteur de plan de la page admin Utilisateurs applique le changement.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Barre de mise en forme flottante à la sélection de texte : gras, italique, barré, souligné, liste, titres, couleur. Marqueurs `[#ff0000]texte[/]` pour la couleur et `++texte++` pour le souligné.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Alignement du texte des chatrooms : à gauche ou justifié, dans la carte « Accessibilité ».",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Bloc « Choix » dans le composeur : 2 à 9 options à voter, résultats en temps réel.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Avertissement de contenu : des étiquettes affichées en tête du message.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Suivre un persona : notification à chaque nouvelle chatroom ou réponse.",
  },
  {
    date: "2026-07",
    tag: "Performance",
    text: "Images redimensionnées et servies en formats modernes, chargées hors écran à la demande. Les onglets d’un monde et les panneaux ne sont chargés qu’à l’ouverture, et un indicateur de chargement laisse la sidebar utilisable.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Les catégories de chatrooms peuvent avoir une image dédiée, affichée en petit format à la place de l’initiale.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Présence, messages, notifications et messages privés se reconnectent après une coupure réseau.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le lien « Catalogue » s’affiche dès qu’objets, compétences ou faceclaims sont activés. Les réglages d’inventaire et de compétences par monde fonctionnent.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Faceclaims : « ft. … » à côté du nom d’un persona, et un onglet Faceclaims dans le Catalogue. Désactivable dans les réglages du monde.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Champ « Liste descriptive » : des paires titre/description.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Confort de lecture des chatrooms : police (Sans serif, Serif, Adapté dyslexie) et taille du texte.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Un spectateur peut réagir à un message.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "La catégorie « Général » affiche bien ses chatrooms.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "La couleur des bulles de dialogue est liée au persona et proposée à chaque message. Surcharge ponctuelle possible : `\"Bonjour !\"{#ff0000}`.",
  },
  {
    date: "2026-07",
    tag: "Personas",
    text: "Sortir un persona d’un monde libère les verrous de sa fiche ; entrer dans un monde avec fiche par défaut remplace la fiche, après confirmation.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "La page Personas affiche les mondes rejoints même sans persona, le quota est garanti au déplacement, et les restrictions de catalogue s’appliquent aussi depuis cette page.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Champs verrouillés de la fiche par défaut : copiés sur les nouveaux personas et impossibles à supprimer, contenu modifiable.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Lien « Paramètres » dans la sidebar d’un monde, pour le propriétaire et les admins.",
  },
  {
    date: "2026-07",
    tag: "Mondes",
    text: "Fiche de persona par défaut : chaque persona créé dans le monde démarre avec sa structure.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Page Personas : glisser-déposer entre mondes pour déplacer ou copier, vue par monde ou alphabétique, mondes sans persona affichés.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Sur mobile, le tiroir se réduit au rail d’icônes quand il n’a pas de panneau à afficher, et le panneau « Mes mondes » hors des pages de monde est retiré.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Le rail d’icônes défile sur les fenêtres de faible hauteur.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Le sélecteur de persona du composeur devient une liste alphabétique, avec des favoris en tête.",
  },
  {
    date: "2026-07",
    tag: "Technique",
    text: "Compteurs de non-lus entretenus localement, sur un seul canal temps réel.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Les notifications de la salle ouverte sont archivées immédiatement.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "« @? » n’apparaît plus sous un message à l’envoi.",
  },
  {
    date: "2026-07",
    tag: "Interface",
    text: "Menu blocs/options du composeur refondu : deux sections, une description par ligne et un aperçu.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Sur mobile, Entrée crée un paragraphe ; Maj+Entrée ou Ctrl+Entrée envoie.",
  },
  {
    date: "2026-07",
    tag: "Chatrooms",
    text: "Messages « SMS » : bulles sans en-tête, regroupées, avatar sur la dernière.",
  },
  {
    date: "2026-07",
    tag: "Social",
    text: "Profil joueur : bio et pronoms dans Paramètres, carte au clic sur l’avatar ou le pseudo.",
  },
  {
    date: "2026-07",
    tag: "Performance",
    text: "Les requêtes de démarrage sont fusionnées en une seule, et un chatroom charge avec moins de requêtes. Un défi gagné par un autre joueur n’est plus marqué gagné pour vous.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "Après déconnexion, l’application ne redirige plus vers le monde d’un autre compte.",
  },
  {
    date: "2026-07",
    tag: "Correctif",
    text: "La barre de mise en forme se place correctement dans le dialogue de création de chatroom, et fermer ce dialogue vide le composeur et son brouillon.",
  },

  // ── 2026-06 ──────────────────────────────────────────────────────────────
  {
    date: "2026-06",
    tag: "Performance",
    text: "Rendu serveur plus rapide : identité, profil et fonctionnalités résolus une seule fois par page.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Navigation mobile : un menu latéral regroupe le rail d’icônes et le panneau actif, sidebar du monde comprise.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Les pages de connexion et d’inscription s’affichent à nouveau.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Moins de requêtes au chargement : profil partagé, session lue localement, marquage « lu » dédoublonné.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Interface en trois langues (français, anglais, espagnol) : détection automatique, choix dans Paramètres, synchronisé entre appareils.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Catalogue des mondes publics sur /explore : recherche, bouton Rejoindre, visibilité réglable par les propriétaires.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Défis quotidiens : un défi aléatoire par joueur et par jour, badge sur le message gagnant, journal anonymisé sur /quests.",
  },
  {
    date: "2026-06",
    tag: "Social",
    text: "Messagerie privée : anciens messages chargés au défilement, ouverture en bas de conversation, plus de conversations en doublon.",
  },
  {
    date: "2026-06",
    tag: "Social",
    text: "Messages privés entre joueurs : rail de conversations, présence, nouvelle conversation depuis le rail ou la fiche Membres.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Sidebar monde : sections Actif, Suivis (étoile ★ dans l’en-tête d’un chatroom) et Tous.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Refonte du layout : rail permanent à gauche, panneau global notifications/messages, sidebar interne aux mondes, vues plein écran ouvertes par lien.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Politiques de sécurité consolidées et évaluées une fois par requête, index redondants supprimés.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Pages Personas, Monde et Chatroom plus rapides : requêtes en parallèle.",
  },
  {
    date: "2026-06",
    tag: "Notifications",
    text: "Notification groupée des réponses dans une chatroom, avec compteur.",
  },
  {
    date: "2026-06",
    tag: "Technique",
    text: "Suite de tests automatisés, unitaires et de bout en bout.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Plus de 404 à l’ouverture d’un monde ; les mondes sans propriétaire sont nettoyés.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Les invitations en attente, les mondes quittés et les mondes archivés n’apparaissent plus dans la sidebar ni sur /home.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Invitations pour rejoindre un monde : une notification présente le monde, avec Rejoindre ou refuser. Un monde non rejoint renvoie un 404.",
  },
  {
    date: "2026-06",
    tag: "Notifications",
    text: "Notifications : mentions, réactions, nouveaux membres, nouvelles chatrooms. Panneau inline, préférences par type, archivage, temps réel.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Carte interactive par monde : image de fond, pins avec titre, description, bannière, icône et couleur ; zoom, déplacement et temps réel. Modification réservée aux éditeurs.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Wiki par monde : pages markdown et dossiers en arborescence, icônes, aperçu. Modification réservée aux éditeurs.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Relations et Catalogue accessibles depuis une chatroom.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Catalogue d’objets et de compétences par monde : inventaire et compétences restreints, catégories et colonnes organisées par glisser-déposer. Activer une restriction purge les données concernées, avec confirmation.",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Toile des relations : cartes de personas colorées par groupe, relations typées et directionnelles avec description, types personnalisables par le propriétaire. Le nom d’un persona prend la couleur de son groupe dans les chatrooms.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Mondes favoris (★ sur la bannière) en haut de la sidebar, avec leurs chatrooms récentes.",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Préférences par monde : largeur de la colonne personas et mode plein écran.",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Les personas sont liés à un monde (5 par monde en gratuit) et se créent depuis sa page ; /p devient une vue globale.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Encadrés : jauges nommées et image comme icône.",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Dix blocs dans l’éditeur de profil : titre, texte, stats, inventaire, compétences, jauges, citation, traits, timeline, séparateur, grille d’images. Plus de 4 100 icônes.",
  },
  {
    date: "2026-06",
    tag: "Personas",
    text: "Éditeur de personnage : apparence en onglets, sections renommables et réordonnables, avatar mis à jour en temps réel dans les messages.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Blocs de jeu dans le composeur : dés, encadré, révélation, PNJ, jauge de vie, bannière, note privée.",
  },
  {
    date: "2026-06",
    tag: "Chatrooms",
    text: "Composeur : dialogues en bulles colorées, images en aperçu, indicateur de frappe, réactions emoji, suppression de ses messages, paramètres de salle repensés.",
  },
  {
    date: "2026-06",
    tag: "Mondes",
    text: "Page d’un monde refondue : onglets sous la bannière, composeur complet, panneau Membres, visibilité, possibilité de quitter un monde.",
  },
  {
    date: "2026-06",
    tag: "Interface",
    text: "Interface générale refondue : sidebar, panneaux empilés, menu utilisateur avec statut de présence, page Changelog, pastille de présence sur les avatars.",
  },
  {
    date: "2026-06",
    tag: "Boutique",
    text: "Boutique remaniée : solde dans l’en-tête, prix sur chaque article.",
  },
  {
    date: "2026-06",
    tag: "Performance",
    text: "Images converties en WebP et servies en taille adaptée.",
  },
  {
    date: "2026-06",
    tag: "Comptes",
    text: "Panneau de profil dans la sidebar (avatar, pseudo), invitation par courriel, pseudo obligatoire à la première connexion.",
  },
  {
    date: "2026-06",
    tag: "Admin",
    text: "Panneau Fonctionnalités : activer ou désactiver chaque fonction, effet immédiat.",
  },
  {
    date: "2026-06",
    tag: "Correctif",
    text: "Authentification : identifiants auto-remplis pris en compte, liens d’invitation valables partout, sessions expirées redirigées, suppression de compte sans blocage.",
  },
  {
    date: "2026-06",
    tag: "Technique",
    text: "Zéro erreur ESLint et TypeScript. La page « Mot de passe oublié » confirme l’envoi.",
  },
  {
    date: "2026-06",
    tag: "Mobile",
    text: "Marge de 8 px autour de la carte principale ; le composeur suit la largeur du conteneur.",
  },

  // ── 2026-05 ──────────────────────────────────────────────────────────────
  {
    date: "2026-05",
    tag: "Chatrooms",
    text: "Les salons de discussion sont mis à jour en temps réel.",
  },
  {
    date: "2026-05",
    tag: "Personas",
    text: "Nouveau sélecteur d’avatar avec cadres et configuration avancée.",
  },
  {
    date: "2026-05",
    tag: "Interface",
    text: "Refonte de la sidebar : navigation par mondes, quota visible, menu utilisateur.",
  },

  // ── 2026-04 ──────────────────────────────────────────────────────────────
  {
    date: "2026-04",
    tag: "Boutique",
    text: "Lancement de la boutique : cadres et objets cosmétiques contre vos pièces.",
  },
  {
    date: "2026-04",
    tag: "Personas",
    text: "Sections personnalisables sur les fiches de personnages.",
  },

  // ── 2026-03 ──────────────────────────────────────────────────────────────
  {
    date: "2026-03",
    tag: "Mondes",
    text: "Invitations dans vos mondes, avec des rôles distincts : admin, éditeur, joueur, observateur.",
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
