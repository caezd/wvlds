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
  // ── 2026-11 ──────────────────────────────────────────────────────────────
  {
    date: "2026-11-25",
    category: "Correctif",
    text: "Sécurité : une requête modifiée à la main depuis le navigateur ne passe plus.\n- seules les données que l’application propose de changer sont modifiables ; propriétaire d’un monde, nature d’un persona, salon d’un message ou conversation d’un message privé sont figés\n- un persona n’entre que dans un monde dont vous êtes membre\n- lieux, catégories et types de relation désignés : toujours ceux du même monde\n- seul le propriétaire supprime son monde\n- notifications de mention et d’invitation établies par le serveur\n- déplacement d’un persona vers un autre monde rétabli",
  },
  {
    date: "2026-11-25",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Taxe des personas, dans Paramètres › Fonctions › Économie › Devises.\n- un montant fixe, tous les N jours, semaines ou mois, à partir d’une date de départ\n- paiement par le joueur (bouton dans l’onglet Inventaire du persona) ou retrait automatique dès que la bourse le permet\n- options : dettes qui s’accumulent ou non, délai pour les nouveaux personas\n- badge facultatif à côté du nom des personas en retard (messages, fiche) ; texte, couleur et icône au choix\n- qui gère l’économie peut annuler une dette ; paiements et annulations au journal d’activité\n- réglages enregistrés d’eux-mêmes, confirmés par un toast",
  },
  {
    date: "2026-11-25",
    category: "Fonctionnalité",
    area: "Membres",
    text: "Journal d’activité du monde, dans Paramètres › Membres › Journal, pour qui gère l’économie.\n- ajustements d’argent, dons et retraits d’objets, achats et reventes en boutique, emplacements d’inventaire, échanges entre personas, taxe payée ou annulée\n- auteur, date et motif de chaque mouvement ; filtres par type, persona (cherché par son nom) et période (choisie au calendrier)\n- la trace reste même si le persona est supprimé\n- les gains automatiques n’y figurent pas",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Gains : la monnaie du monde se gagne en jouant, à régler dans Paramètres › Fonctions › Économie › Devises ; un montant à zéro ne rapporte rien.\n- montant par message\n- montant négatif possible (case « + / − » devant le montant) : retire de la bourse, jusqu’à zéro\n- cases réservées aux chiffres\n- gain de la première visite du jour, pour chacun de vos personas du monde\n- délai entre deux messages payés, sous le gain par message\n- plafond par jour, à part\n- montants réglables au clavier ou aux boutons −/+\n- chaque gain apparaît dans l’historique de la bourse",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Échanges : un bloc **Transférer** dans le composeur, pour donner de l’argent ou des objets à un autre persona du monde.\n- transfert immédiat : la bourse et l’inventaire du destinataire sont crédités à l’envoi\n- le message montre qui a donné quoi à qui, tel que la base l’a enregistré\n- à activer dans Paramètres › Fonctions › Économie › Échanges\n- échanges entre personas d’un même compte : option à part, coupée par défaut",
  },
  {
    date: "2026-11-24",
    category: "Interface",
    area: "Monde",
    text: "Paramètres › Fonctions : une sous-catégorie **Économie** (Devises, Objets, Boutiques, Échanges) ; le catalogue se sépare en deux vues.\n- **Objets** et **Compétences** : une vue chacune dans le menu du monde, à la place du Catalogue\n- réglages des compétences et des faceclaims dans Fonctions › Personas\n- faceclaims retirés du catalogue",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Boutiques : une vue **Boutiques** dans le menu du monde, à activer dans Paramètres › Fonctions › Économie › Boutiques (avec la monnaie et les objets).\n- plusieurs boutiques par monde, une par onglet\n- chacune vend des objets du catalogue, à un prix dans la monnaie du monde\n- stock limité ou illimité, au choix pour chaque article\n- achat pour un de vos personas, payé sur sa bourse ; l’objet rejoint son inventaire\n- revente si la boutique l’accepte : prix de rachat propre à l’article ou pourcentage du prix ; l’objet revendu revient dans le stock\n- boutiques, articles, prix et stocks gérés depuis la page de réglages Boutiques ; un lien « Gérer les boutiques » y mène depuis la vue\n- une boutique fermée ne se voit que de qui gère l’économie",
  },
  {
    date: "2026-11-24",
    category: "Correctif",
    area: "Catalogue",
    text: "Les catégories du catalogue s’affichent de nouveau.",
  },
  {
    date: "2026-11-24",
    category: "Interface",
    area: "Catalogue",
    text: "Le catalogue devient un tableau, pour les objets comme pour les compétences.\n- une colonne par catégorie (plantes, armes, armures…), les objets sans catégorie en tête\n- glisser une carte d’une colonne à l’autre, ou une colonne pour la changer de place\n- une colonne repliée devient une bande étroite\n- « Créer une catégorie » au bout du tableau",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Catalogue",
    text: "Inventaire des personas : un onglet **Inventaire** sur la fiche, avec la bourse et les objets ; réglages dans Paramètres › Fonctions › Économie › Objets.\n- ajout d’objets, à cocher : libre, pioché dans le catalogue, ou tenu (objets donnés, achetés ou échangés)\n- emplacements de départ, plafond et prix d’un emplacement ajouté, payé sur la bourse du persona\n- un objet empilable prend un emplacement, un objet unique un par exemplaire\n- qui gère l’économie donne ou reprend un objet du catalogue\n- un clic sur un objet du catalogue ouvre sa fiche\n- le champ de fiche « Inventaire » disparaît : ses objets sont passés dans l’onglet",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Économie : une monnaie propre au monde et une bourse pour chaque persona, dans Paramètres › Fonctions › Économie › Devises.\n- monnaie divisée en paliers (or, argent, cuivre…), chacun valant un nombre entier du suivant ; les montants se convertissent d’eux-mêmes\n- bourse dans l’onglet **Inventaire** de la fiche du persona : solde et derniers mouvements\n- permission **Gérer l’économie** : créditer ou débiter une bourse, avec un motif",
  },
  {
    date: "2026-11-24",
    category: "Interface",
    area: "Monde",
    text: "Paramètres du monde : **Général** et **Communauté** en tête du menu, hors groupe ; le groupe **Monde** ne garde que **Page d’accueil**.",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chatbox : connexion des joueurs, dans Paramètres › Fonctions › Chatbox.\n- connexion dès l’arrivée dans le monde, ou en cliquant sur **Rejoindre**\n- avec **Rejoindre**, déconnexion pour inactivité au choix, de 5 minutes à 2 heures : seuls l’écriture et l’envoi de messages comptent\n- avec **Rejoindre**, **Lecture déconnecté** : ne peut rien lire, ou lecture seule\n- **Quitter** dans l’en-tête ; arrivées et départs annoncés dans **Général**",
  },
  {
    date: "2026-11-24",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chatbox : une salle peut être réservée à un groupe de personas, à sa création ou ensuite (Paramètres › Chatbox › Salles).\n- seuls la voient les joueurs qui ont un persona dans ce groupe ou l’un de ses sous-groupes, et les gérants du monde\n- supprimer le groupe supprime la salle et ses messages, après confirmation",
  },
  {
    date: "2026-11-24",
    category: "Interface",
    area: "Monde",
    text: "Chatbox :\n- reste ouverte ou fermée d’une visite à l’autre, selon le dernier choix\n- **Plein écran** : elle prend la place de la page\n- en bas ou à droite de la page, au choix\n- taille réglable en glissant l’espace qui la sépare de la page, retenue d’une visite à l’autre\n- remonté dans le fil, le bouton **Descendre** des salons ramène aux derniers messages\n- étroite (à droite, sur mobile) : les salles passent dans un menu, avec leurs pastilles de nouveaux messages ; les présents se réduisent à leur nombre\n- **Répondre** et **Supprimer** apparaissent au survol, juste après l’heure ; un clic sur le message ne répond plus\n- le pseudo ouvre le profil du joueur, le nom du persona (et son avatar) sa fiche",
  },
  {
    date: "2026-11-24",
    category: "Correctif",
    area: "Salons",
    text: "Le bouton **Descendre**, caché, ne bloque plus les clics au bas du fil des salons et de la chatbox.",
  },
  {
    date: "2026-11-24",
    category: "Interface",
    area: "Personas",
    text: "Paramètres › Groupes : un groupe se crée et se règle sur sa page — nom, description, couleur propre ou héritée, couleur appliquée, membres. Dans la liste, une ligne ouvre la page du groupe ; son menu ajoute un sous-groupe, déplace ou supprime.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Groupes de personas : un persona peut appartenir à plusieurs groupes.\n- son **groupe principal** donne sa couleur ; le premier groupe rejoint le devient, un autre se choisit ensuite\n- Paramètres › Groupes : chaque groupe montre son nombre de membres et ouvre sa fiche — description, membres, ajout de plusieurs personas d’un coup, choix du groupe principal, retrait\n- Relations : la fiche d’un persona coche ses groupes et désigne le principal",
  },
  {
    date: "2026-11-23",
    category: "Interface",
    area: "Monde",
    text: "Paramètres d’un monde : toutes les pages ont la même largeur et la même mise en page — titre à gauche, réglages à droite. Général, Page d’accueil, Communauté, Catégories et Signalements reprennent les listes et cartes des autres pages.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chatbox : **gras** et *italique* dans les messages, avec `**texte**` et `*texte*`.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chatbox : quatre options, désactivées par défaut, dans Paramètres › Fonctions › Chatbox :\n- **Couleurs de dialogue** : chaque joueur choisit la couleur de ses messages.\n- **Bulles** : les messages s’affichent en bulles, les siens sur un fond distinct.\n- **Écrire avec un persona** : le message est signé « joueur avec persona », avec l’avatar du persona ; le nom du persona prend la couleur de son groupe.\n- **Actions /me** : « /me ouvre la porte. » s’affiche en italique, précédé du nom du joueur ou de son persona.",
  },
  {
    date: "2026-11-23",
    category: "Interface",
    area: "Monde",
    text: "Chatbox : plus de fond au survol d’un message ; boutons Répondre et Supprimer toujours à la même place, calés sur le texte. Après un envoi, le curseur reste dans le champ pour enchaîner.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chatbox : nombre de messages conservés par salle réglable dans Paramètres › Fonctions › Chatbox — 25, 50 ou 100 (le maximum, et le défaut). Au-delà, les plus anciens sont effacés automatiquement ; baisser le réglage efface le surplus tout de suite. Tout ce qui est conservé se relit avec « Messages précédents », en haut du fil.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chatbox : des salles, réglables dans Paramètres › Fonctions › Chatbox — nom, couleur, icône (« # » par défaut), ordre. Dans un salon de jeu, la chatbox ouvre d’elle-même le fil de ce salon, qui réunit les discussions à son sujet, en plus des autres salles. Un clic sur un message permet d’y répondre ; la réponse affiche le message cité. Une pastille signale les salles où de nouveaux messages sont arrivés.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Paramètres › Fonctions : nouvelle entrée « Chatbox ». Chaque monde choisit d’activer ou non sa discussion hors-jeu en barre au bas de ses pages ; elle est désactivée par défaut. Désactivée, la barre disparaît et les messages sont mis de côté, puis reviennent à la réactivation.",
  },
  {
    date: "2026-11-23",
    category: "Interface",
    area: "Monde",
    text: "Paramètres › Fonctions : les réglages d’une fonction désactivée restent affichés, grisés, pour voir ce qu’elle offre avant de l’activer — restrictions du catalogue, faceclaim obligatoire, nom du lien du wiki, validation et édition de la fiche modèle, réglages de la chronologie. Leur aide reste consultable au survol.",
  },
  {
    date: "2026-11-23",
    category: "Interface",
    area: "Membres",
    text: "Message de bienvenue : même aperçu que les annonces — un bouton « Aperçu » qui le montre tel que le nouveau membre le recevra, et, sur grand écran, l’aperçu en direct à côté de l’éditeur.",
  },
  {
    date: "2026-11-23",
    category: "Interface",
    area: "Membres",
    text: "Annonces : un bouton « Aperçu » montre l’annonce telle que les destinataires la verront — dans la cloche puis ouverte, en bandeau, en message privé, et dans le widget de l’accueil si elle y est — sans avoir à s’envoyer un essai. Sur grand écran, cet aperçu reste affiché à droite du formulaire et suit chaque modification. Les étiquettes ont désormais leur icône, et se choisissent sous leur vraie apparence.",
  },
  {
    date: "2026-11-23",
    category: "Interface",
    area: "Monde",
    text: "Paramètres d’un monde : les onglets laissent place à un menu à gauche, rangé en groupes (Monde, Fonctions, Salons & personas, Membres). Catalogue, carte, wiki, personas et chronologie y ont chacun leur entrée, avec leur état. La section ouverte est dans l’adresse, et le bouton Précédent y revient. Sur mobile, le menu s’affiche en liste, puis la section choisie en plein écran. La suppression du monde passe dans « Général », sous « Zone de danger ».",
  },
  {
    date: "2026-11-23",
    category: "Technique",
    area: "Membres",
    text: "Annonces : une image d’en-tête remplacée, retirée ou laissée dans un brouillon abandonné est aussitôt effacée du stockage ; un ménage quotidien rattrape celles qui auraient échappé (onglet fermé avant l’envoi, image changée sur l’annonce d’un autre membre de l’équipe).",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Widget « Dernières annonces » pour l’accueil d’un monde : il montre à tous les membres les annonces que l’équipe a choisi d’y afficher, les épinglées en tête, et se met à jour en direct. Chaque annonce s’ouvre en entier d’un clic.",
  },
  {
    date: "2026-11-23",
    category: "Fonctionnalité",
    area: "Membres",
    text: "Annonces : une étiquette (Info, Événement, Règles, Maintenance, Important), une image d’en-tête, et deux nouvelles options, « Afficher sur l’accueil » et « Épingler ». Une annonce envoyée se modifie ensuite depuis l’historique : notifications, messages privés et bandeaux suivent, avec la mention « modifiée ».",
  },
  {
    date: "2026-11-23",
    category: "Correctif",
    text: "Sécurité : il n’est plus possible de diffuser de faux avis en temps réel (faux message privé, faux message du chat en direct, liste des salons faussée) en appelant directement une fonction interne de la base.",
  },
  {
    date: "2026-11-22",
    category: "Fonctionnalité",
    area: "Membres",
    text: "Annonces aux membres d’un monde : écrire à tous, ou aux seuls porteurs de certains rôles, depuis l’onglet « Annonces » des réglages :\n- par message privé, envoyé depuis votre compte (les réponses arrivent dans vos messages privés)\n- par notification : un titre et un texte, dans la cloche et sur les appareils\n- ou par bandeau, en tête de l’accueil du monde, jusqu’à ce que le membre le ferme ou pour 1, 7 ou 30 jours\n\nNotification et bandeau peuvent être signés au nom du monde, avec son icône. Envoi immédiat ou programmé à une date et une heure, jusqu’à 90 jours à l’avance.\n\nDestinataires affinables : sauf certains rôles, nouveaux arrivants, membres sans message dans le monde depuis 7, 30 ou 90 jours. Variables `{username}` et `{world}` remplacées pour chaque membre, aperçu avant l’envoi, dix par jour au plus. Essai à soi-même selon le type : la notification dans les vôtres, le bandeau en tête de votre accueil du monde.\n\nHistorique des annonces envoyées : nombre de lectures, texte complet, reprise d’une annonce dans le formulaire, retrait d’une notification ou d’un bandeau.\n\nMessage de bienvenue : envoyé automatiquement à chaque nouveau membre, en message privé ou en notification, signée au besoin au nom du monde.\n\nRéservé à la nouvelle permission « Envoyer des annonces ».",
  },
  {
    date: "2026-11-22",
    category: "Correctif",
    area: "Messagerie",
    text: "Messages privés : conversations classées par dernier message, et plus aucune conversation sautée en faisant défiler la liste quand plusieurs ont reçu un message au même instant.",
  },
  {
    date: "2026-11-22",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Groupes de personas : un onglet « Groupes » dans les réglages du monde, et des sous-groupes sur autant de niveaux que voulu :\n- créer, renommer, réordonner, ranger un groupe dans un autre ou l’en sortir\n- un sous-groupe sans couleur propre prend celle de son parent\n- les personas d’un sous-groupe comptent dans ses parents : inviter un groupe à un salon invite ses sous-groupes, filtrer sur un groupe les montre aussi\n- supprimer un groupe fait remonter ses sous-groupes d’un niveau\n- « Couleur appliquée », groupe par groupe : la couleur teinte ou non le nom des personas dans les salons, l’anneau de leur avatar, leurs tuiles, la chronologie et la toile des relations",
  },
  {
    date: "2026-11-21",
    category: "Correctif",
    area: "Monde",
    text: "Chronologie : nombre de salons de la période sélectionnée plus lisible (contraste suffisant).",
  },
  {
    date: "2026-11-20",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Nouveau salon : il s’ouvre vide, sans premier message à écrire. À la création :\n- titre, lieu de la carte, catégorie ;\n- date et « Suite de… » dans la chronologie ;\n- visibilité : ouvert (tout le monde lit et écrit), public (tout le monde lit, les invités écrivent), privé (seuls les invités lisent et écrivent) ;\n- invités : des personas ou des groupes de personas ;\n- synopsis, affiché en tête du salon.\n\nVisibilité, invités et synopsis se changent aussi dans les réglages de la salle.",
  },
  {
    date: "2026-11-19",
    category: "Correctif",
    area: "Wiki",
    text: "En revenant sur un onglet resté en veille ou après une coupure réseau, le wiki (arbre des pages, lexique, notes et annotations) et la carte (lieux, régions, liens) se remettent à jour avec ce qui a changé entre-temps, comme la liste des salons.",
  },
  {
    date: "2026-11-18",
    category: "Performance",
    text: "Réordonner part en une seule fois, quel que soit le nombre d’éléments : cartes du monde, pages du wiki, catégories de salons, onglets de la fiche par défaut, notes du wiki et leurs catégories. Mettre à la corbeille ou changer la rareté de plusieurs objets du catalogue aussi. Et un déplacement refusé ne reste plus affiché pour revenir en arrière au rechargement : il est annulé tout de suite, avec un message.",
  },
  {
    date: "2026-11-18",
    category: "Interface",
    area: "Personas",
    text: "La fiche d’un persona a toujours son bouton « Enregistrer » en bas, grisé tant que rien n’a changé — y compris juste après sa création, qui fonctionne désormais comme l’édition : rien ne part avant « Enregistrer », et fermer avec des modifications en attente demande quoi en faire.",
  },
  {
    date: "2026-11-18",
    category: "Performance",
    area: "Personas",
    text: "Enregistrer une fiche part en une seule fois, quel que soit le nombre d’onglets et de champs touchés, et c’est tout ou rien : un refus n’enregistre plus une fiche à moitié. Un champ déplacé dans un onglet tout neuf s’enregistre aussi correctement.",
  },
  {
    date: "2026-11-18",
    category: "Interface",
    area: "Salons",
    text: "Les réglages d’une salle (nom, icône, bannière, date, catégorie, lieu) ne s’enregistrent plus un à un : un bouton « Enregistrer » en bas les écrit tous ensemble, et fermer avec des réglages en attente demande quoi en faire. Une image choisie puis abandonnée ne remplace plus l’ancienne.",
  },
  {
    date: "2026-11-18",
    category: "Performance",
    area: "Monde",
    text: "La liste des salons d’un monde se calcule environ 30 % plus vite, et ne ralentira plus à mesure que les salons se remplissent. Les salons à date égale apparaissent désormais toujours dans le même ordre.",
  },
  {
    date: "2026-11-18",
    category: "Correctif",
    area: "Salons",
    text: "Un message « inséré avant » compte désormais dans les non-lus, même si la partie du fil où il se place avait déjà été lue. Avant, le compteur montait sur le moment puis retombait au rechargement.",
  },
  {
    date: "2026-11-18",
    category: "Correctif",
    area: "Monde",
    text: "En revenant sur un onglet resté en veille ou après une coupure réseau, la liste des salons se remet à jour : ordre, derniers messages et avatars des derniers posteurs. Avant, elle restait figée, et revenait parfois même à son état du chargement de la page. Même rattrapage pour la grille et les dossiers de salons, les widgets de l’accueil, le chat en direct et les messages privés.",
  },
  {
    date: "2026-11-17",
    category: "Correctif",
    text: "Qui se trouve dans un salon et qui y écrit n’est plus visible que des membres du monde ; dans une conversation privée, seuls ses deux participants voient l’autre écrire. La liste des personnes en ligne n’est plus visible que des comptes connectés, et les spectateurs du chat en direct d’un monde que de ses membres. Après la mise à jour, rechargez la page si l’indication « … écrit » ou la présence en ligne ne s’affichent plus.",
  },
  {
    date: "2026-11-17",
    category: "Performance",
    text: "Chaque mise à jour de l’application télécharge environ 6 Mo de moins en arrière-plan : l’application ne garde d’avance que ce qu’il faut pour afficher la page « Vous êtes hors ligne ». Le reste se met en cache au fil des pages visitées, comme avant.",
  },
  {
    date: "2026-11-17",
    category: "Performance",
    text: "Les pages s’ouvrent plus vite : environ un tiers de JavaScript en moins sur les pages de réglages, de boutique et d’exploration, et 40 à 55 ko de moins sur un salon ou un monde. Le catalogue d’icônes, la compression d’images, les panneaux de messages et de notifications, la fiche de profil et la fenêtre d’encadré ne se chargent plus qu’au moment où l’on s’en sert.",
  },
  {
    date: "2026-11-17",
    category: "Interface",
    area: "Salons",
    text: "Le contenu d’un encadré se rédige comme un message : un retour fait un saut de ligne, un second ouvre un nouveau paragraphe, avec la même barre de mise en forme. Ses paragraphes s’affichent aussi espacés que ceux d’un message.",
  },
  {
    date: "2026-11-17",
    category: "Correctif",
    area: "Salons",
    text: "Supprimer un message, même ancien, ne fait plus disparaître l’avatar, l’heure et l’aperçu du dernier message dans la liste des salons.",
  },
  {
    date: "2026-11-17",
    category: "Correctif",
    area: "Salons",
    text: "La fenêtre de l’encadré ne déborde plus de l’écran avec un long texte : l’aperçu et le formulaire défilent chacun de leur côté, et les boutons restent visibles.",
  },
  {
    date: "2026-11-17",
    category: "Fonctionnalité",
    area: "Salons",
    text: "« Insérer avant », dans le menu d’un message : comme pour « Répondre », le composeur passe en mode insertion, et le message envoyé prend place dans le fil juste avant le message choisi — pratique pour une réplique oubliée. Il porte la mention « (inséré) », avec sa vraie date d’envoi au survol.",
  },
  {
    date: "2026-11-17",
    category: "Performance",
    text: "Tout le temps réel passe désormais par des canaux privés partagés entre les écrans : moins de travail pour le serveur, et la liste des salons suit enfin les renommages, les suppressions et le premier message d’un salon sans recharger la page.",
  },
  {
    date: "2026-11-17",
    category: "Performance",
    area: "Monde",
    text: "Passer de l’accueil d’un monde à l’un de ses salons, et retour, ne recharge plus la barre latérale : elle reste en place, avec sa position de défilement, et la page s’affiche plus vite. En changeant de monde, l’ancienne liste de salons laisse place à un squelette le temps d’afficher la nouvelle.",
  },
  {
    date: "2026-11-17",
    category: "Performance",
    text: "Les images (avatars, bannières, icônes) restent en cache un an au lieu d’une heure : elles ne sont plus retéléchargées à chaque visite. Le badge d’un défi relevé apparaît en direct chez tous les joueurs du salon, et régler la couleur des dialogues n’envoie plus qu’une seule sauvegarde.",
  },
  {
    date: "2026-11-16",
    category: "Interface",
    area: "Salons",
    text: "Les bulles de dialogue prennent la couleur choisie, au lieu d’une version pâlie : son opacité va jusqu’à 80 %, et leur texte passe au noir sur une couleur claire pour rester lisible.",
  },
  {
    date: "2026-11-16",
    category: "Correctif",
    text: "Les menus ouverts depuis une fenêtre (choix d’icône ou d’emoji de l’encadré, listes déroulantes…) répondent de nouveau : on peut y faire défiler la liste, cliquer dans la recherche et y écrire.",
  },
  {
    date: "2026-11-13",
    category: "Fonctionnalité",
    area: "Relations",
    text: "La page des relations gagne une vue « Constellations » : chaque persona se place près de ceux qu’il connaît, en îlots par joueur ou par groupe, et les personas sans relation sont rangés à part. Les vues Cercle et Constellations se regroupent au choix par joueur ou par groupe, et peuvent masquer les personas isolés ; la vue Centré peut masquer son second cercle. Les réglages sont retenus pour chaque monde.",
  },
  {
    date: "2026-11-12",
    category: "Interface",
    text: "Pastilles de compteur (notifications, non-lus) d’un rouge plus soutenu : le chiffre se lit mieux.",
  },
  {
    date: "2026-11-12",
    category: "Interface",
    text: "Sélecteur de couleur : de nouveau noir, six teintes vives et blanc comme couleurs proposées.",
  },
  {
    date: "2026-11-12",
    category: "Correctif",
    area: "Page d’accueil",
    text: "La page d’un monde dont l’accueil affiche le bloc « Anniversaires » ou « Carte » s’ouvre de nouveau (« Une erreur est survenue »).",
  },
  {
    date: "2026-11-12",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Ordre de passage : le créateur d’un salon (ou qui gère les salons) range les joueurs depuis l’en-tête du salon. Une languette accrochée au haut de la zone de saisie indique « À vous de jouer » ou à qui c’est le tour, et le tour passe tout seul au suivant dès que le joueur concerné poste. Poster hors tour reste possible.",
  },
  {
    date: "2026-11-12",
    category: "Fonctionnalité",
    area: "Salons",
    text: "On peut signaler le message d’un autre joueur (« Signaler » dans son menu), avec une raison. Les membres qui gèrent les salons du monde retrouvent les signalements dans un nouvel onglet « Signalements » des réglages : voir le message, classer le signalement, ou supprimer le message.",
  },
  {
    date: "2026-11-11",
    category: "Fonctionnalité",
    area: "Salons",
    text: "On peut répondre à un message : « Répondre » dans son menu (appui long sur mobile). La réponse s’affiche avec une citation de l’original — auteur et extrait — qui ramène à lui d’un clic, même loin dans l’historique. Un message retouché par son auteur porte désormais la mention « (modifié) » à côté de sa date ; la survoler indique quand.",
  },
  {
    date: "2026-11-11",
    category: "Performance",
    text: "Tout va plus vite. Les salons s’ouvrent en une seule fois, envoyer un message est instantané, et passer d’un salon à l’autre garde la barre latérale en place. Les mondes s’affichent sans attendre leur barre latérale et chaque onglet ne charge que ce qu’il montre. Revenir sur une page quittée depuis moins de 30 secondes est immédiat, et le serveur tourne désormais à Londres, à côté de la base de données.",
  },
  {
    date: "2026-11-11",
    category: "Correctif",
    area: "Salons",
    text: "Un direct plus fiable. Au retour d’une coupure ou d’une veille, un salon se remet entièrement à jour : nouveaux messages, modifications, suppressions, réactions et votes. Les sondages anciens affichent de nouveau leurs votes. Rejoindre un monde fait apparaître ses non-lus sans recharger, en être retiré coupe aussitôt tout ce qui en venait, et les notes privées ne sont plus jamais annoncées à ceux qui ne peuvent pas les lire. Le direct passe aussi par des canaux plus légers, prévus pour les grands mondes très actifs.",
  },
  {
    date: "2026-11-09",
    category: "Fonctionnalité",
    area: "Notifications",
    text: "« Marquer comme lu » au clic droit d’un monde (sélecteur de mondes, barre des mondes) : vide d’un coup ses salons non lus et ses notifications.",
  },
  {
    date: "2026-11-09",
    category: "Interface",
    text: "Nouveau sélecteur de couleur dans toute l’application :\n- pastilles de la palette, zone saturation et luminosité, teinte, code hexadécimal\n- opacité réglable (texte, bulles, encadrés, jauges, carte, groupes et types de relations)",
  },
  // ── 2026-10 ──────────────────────────────────────────────────────────────
  {
    date: "2026-10-04",
    category: "Interface",
    area: "Relations",
    text: "Page Relations redessinée (grand écran) :\n- vue « Cercle » : tous les personas sur un cercle, groupés par joueur sous un arc, relations en cordes\n- vue « Centré » : un persona au centre, ses relations puis celles de second degré en deux anneaux\n- panneau à droite : vue d’ensemble (types à masquer, joueurs), un joueur et ses personas, la fiche d’un persona et ses relations\n- survol d’un persona, d’un joueur ou d’un lien pour isoler ses liens ; double-clic pour centrer\n- zoom net à la molette et aux boutons, déplacement au glisser",
  },
  // ── 2026-09 ──────────────────────────────────────────────────────────────
  {
    date: "2026-09-28",
    category: "Fonctionnalité",
    area: "Personas",
    text: "Option « Couleur de groupe » (réglages du monde, Relations) :\n- teinte le nom d’un persona dans les salons, comme avant\n- sur sa fiche, un anneau et un halo à la couleur de son groupe autour de l’avatar sans cadre\n- activée par défaut",
  },
  {
    date: "2026-09-28",
    category: "Interface",
    area: "Personas",
    text: "L’aperçu de l’éditeur de fiche montre exactement la fiche : badges, onglets Relations, Journal et Relecture, couleur de groupe ; « Suivre » en bouton bordé, aligné sur le nom.",
  },
  {
    date: "2026-09-28",
    category: "Correctif",
    text: "« Vu il y a… » : la dernière connexion des joueurs n’était jamais enregistrée ; tout le monde apparaissait « Hors ligne ».",
  },
  {
    date: "2026-09-28",
    category: "Interface",
    area: "Personas",
    text: "Onglets Relations, Journal et Validation d’un persona en icônes, après les sections de sa fiche :\n- Relations : une carte par persona, avec son joueur, et le type à sa couleur ; « Voir dans Relations »\n- Relecture : état de la fiche en bandeau, avec Valider et Renvoyer ; commentaires avec avatar ; un point sur l’onglet tant que la fiche n’est pas validée",
  },
  {
    date: "2026-09-28",
    category: "Correctif",
    area: "Membres",
    text: "Un persona supprimé, créé ou modifié depuis son tiroir apparaît aussitôt dans les pages Membres et Personas, sans recharger.",
  },
  {
    date: "2026-09-28",
    category: "Correctif",
    text: "Listes avec recherche (tags de l’explorateur…) et menus contextuels : l’élément survolé n’est plus surligné en rouge ; cases à cocher moins arrondies.",
  },
  {
    date: "2026-09-28",
    category: "Correctif",
    area: "Salons",
    text: "La bordure « complète » des encadrés s’affiche de nouveau.",
  },
  {
    date: "2026-09-28",
    category: "Interface",
    text: "Couleurs et styles harmonisés dans toute l’application :\n- palette sombre à légère teinte froide, coins un peu moins arrondis\n- une couleur par sens : succès, avertissement, erreur, info, PNJ\n- présence identique partout : vert en ligne, orange absent, rouge hors ligne\n- badges et compteurs non lus au même format ; tailles de texte et intitulés de section unifiés\n- les mêmes douze couleurs proposées dans tous les sélecteurs (rôles, groupes, arcs, régions, épingles, jauges, encadrés, bulles), indigo par défaut\n- boutons harmonisés : ce qui enregistre ou envoie en pilule, « Annuler » à côté ; ce qui ouvre un panneau ou un formulaire, les filtres, outils et fermetures en coins arrondis, bordé ou nu\n- menus et sélecteurs toujours au-dessus des fenêtres qui les ouvrent\n- cartes cliquables (chiffres des pages Membres et Personas, catégories de salons) : une lueur discrète suit la souris au survol\n- tuiles de persona : léger zoom du portrait et ombre au survol\n- apparence d’une épingle de carte : couleurs choisies comme dans l’encadré (palette, « Aucun »), bordure en bascule",
  },
  {
    date: "2026-09-28",
    category: "Interface",
    area: "Salons",
    text: "Avatars des personas ronds dans les salons : messages, SMS, messages épinglés, persona du compositeur ; carrés sous un cadre.",
  },
  {
    date: "2026-09-28",
    category: "Interface",
    area: "Compte",
    text: "« Mon profil » redessiné :\n- avatar carré, pseudo modifiable sur place et pronoms en tête\n- trois onglets : Profil (bio, pronoms), Ma carte (dans le monde où vous êtes), Compte (e-mail, mot de passe)\n- un seul bouton « Enregistrer » pour tout, qui n’envoie que ce qui a changé ; Ctrl/⌘ + S ; confirmation avant de fermer sans enregistrer\n- bio et pronoms relus à chaque ouverture ; une carte modifiée reste celle de son monde jusqu’à l’enregistrement\n- pronoms en puces carrées, « Autre » compris, avec leur compteur\n- statut de la carte en sélecteur segmenté ; « Utiliser le mien » à côté du fuseau, avec l’heure qu’il est chez vous",
  },
  {
    date: "2026-09-27",
    category: "Interface",
    area: "Membres",
    text: "Page des membres redessinée en « Joueurs & personas » :\n- une étagère par joueur : avatar et présence, statut, puis une ligne (rôles, dernière activité, heure locale, anniversaire), et tous ses personas en grille, nom et groupe sur l’image\n- actions : « Profil » et « Écrire » (message privé) ; une tuile « Nouveau persona » sur la vôtre\n- « Ma carte dans ce monde » se règle désormais dans « Mon profil » (menu principal)\n- étagère des PNJ du monde en dernier\n- vues « Groupes » et « Liste »\n- cartes de tête : joueurs en ligne, mes personas, fiches à relire, hors jeu ; un clic filtre\n- recherche sur le joueur, ses rôles et ses personas ; un persona trouvé n’affiche que lui, « Voir tous ses personas » rend les autres\n- palette sobre : portraits sans image en gris, couleurs des rôles et groupes en pastilles",
  },
  {
    date: "2026-09-27",
    category: "Interface",
    area: "Personas",
    text: "Liste des personas d’un monde redessinée en étagères :\n- rangement par joueur (le vôtre d’abord, les PNJ à la fin), par groupe, ou en liste unique avec index A–Z ; le choix est retenu par monde\n- par joueur et par groupe : en-tête (avatar ou groupe, chiffres) au-dessus des personas, sur plusieurs lignes ; dès cinq, le plus actif des 30 derniers jours en grand\n- cartes de tête : mes personas, fiches à relire, PNJ, hors jeu ; un clic filtre, un second retire le filtre\n- nouveau filtre de statut « Hors jeu » (décédés et retirés)\n- tuiles avec le nom et le groupe ou le joueur posés en bas du portrait, fond teinté de la couleur du groupe sans avatar ; un persona hors jeu est grisé en entier\n- en tête de chaque joueur : son avatar et sa présence (en ligne, absent, hors ligne) ; pause ou absence déclarée signalée",
  },
  {
    date: "2026-09-27",
    category: "Interface",
    area: "Relations",
    text: "Toile des relations redessinée :\n- avatars ronds cerclés de la couleur du groupe, dans une zone par joueur placée automatiquement\n- liens en courbes fines, un point indique le sens ; survoler un persona ou un lien met ses relations en avant\n- vue « Centré » : un persona au milieu, ses relations autour, puis les relations de celles-ci\n- joueurs de plus de dix personas repliés en une bulle, dépliable (jamais les vôtres) ; repli à la main dès cinq\n- panneau flottant : demandes reçues en tête, ajout d’une relation et changement de groupe sur place\n- double-clic sur un persona : vue « Centré » sur lui ; au survol, son joueur et son nombre de relations\n- noms lisibles à tous les niveaux de zoom ; liens discrets au repos\n- recherche toujours visible, avec suggestions ; légende en une barre, avec le nombre de relations par type ; recentrage automatique sur les personas affichés\n- raccourcis : Échap, F (recentrer), + et - (zoom) ; une aide au premier passage",
  },
  {
    date: "2026-09-26",
    category: "Interface",
    area: "Monde",
    text: "Réglages du monde redessinés :\n- explications derrière une icône d’aide en bout de ligne, ouverte au survol, au clavier ou d’un appui\n- onglet Fonctions redessiné : les catégories à gauche avec leur état (Actif, Off), la page de chacune à droite, son interrupteur en tête ; ses sections s’empilent quand la place manque\n- chronologie : date actuelle en grand avec la progression des mois, année réglable d’un pas, mois du calendrier en grille\n- onglet Relations au même style : groupes et types de relation modifiés sur place (couleur, nom, trait, réciprocité)\n- onglet Rôles au même style : couleur et icône en tête de la fiche, permissions en interrupteurs par groupe, « Tout activer » / « Tout désactiver »",
  },
  {
    date: "2026-09-26",
    category: "Fonctionnalité",
    area: "Salons",
    text: "Suites entre salons :\n- « Suite de… » à la création d’un salon ou dans ses réglages\n- dans un salon où l’on ne joue pas : suite proposée, à accepter par ses participants\n- jamais à rebours de la chronologie\n- permission « Relier des salons », donnée aux joueurs",
  },
  {
    date: "2026-09-26",
    category: "Fonctionnalité",
    area: "Monde",
    text: "Chronologie d’un monde :\n- événements datés sans salon, liés à une page du wiki\n- événements en cartes\n- événements qui durent : « jusqu’à » leur fin à côté du titre, une barre le long du fil ; au survol, ce qui se passe pendant reste net\n- fêtes du calendrier, rappelées à leur date dans les mois qui ont une entrée ; widget d’accueil « Prochaines fêtes »\n- statut des salons (en cours, pause, terminé, abandonné), lu sur leur anneau (icône pause) et filtrable\n- arcs narratifs : salons teintés ; ceux reliés par une suite numérotés dans l’ordre du récit\n- suites tracées en rail ou en graphe, en permanence ou au survol ; en pointillés tant qu’elles sont proposées ; d’un arc à l’autre sans fondre leurs chaînes\n- fil d’un persona quand on filtre par lui\n- journaux des personas, en option\n- recherche et filtres : type, persona, joueur, arc, catégorie\n- saisons du monde\n- années en bandeaux ; mois séparés d’un bord à l’autre, leur nom contre le fil\n- tête : nombre de salons et d’arcs, « Aujourd’hui », légende des marques du fil ; seule la frise défile\n- bandeau de position toujours visible : année, mois en cours et ses salons, flèches vers le mois voisin ; puces des arcs, celui du salon survolé en tête\n- mini-carte à droite de la frise, sur grand écran : années et mois, salons par mois, zone des mois visibles, date actuelle, arc isolé ; elle suit le défilement ; un clic y mène\n- aperçu d’un salon au survol : participants, extrait du dernier message, nombre de messages, ancienneté du dernier\n- en rail, au survol d’un salon, un pointillé à la couleur de son arc le relie à sa pastille\n- sur écran tactile, un appui sur un salon ouvre un tiroir : arc et épisode, participants, dernier message, épisodes de l’arc, salons voisins\n- permission « Gérer la chronologie »",
  },
  {
    date: "2026-09-26",
    category: "Performance",
    area: "Monde",
    text: "Chronologie :\n- chargée en une seule requête, affichée d’un bloc\n- dates rendues au fil du défilement, vers le haut comme vers le bas\n- personas de chaque salon tenus à jour plutôt que recalculés\n- recherche fluide sur les grands mondes\n- lignes de suite et barres de durée mesurées en une seule passe\n- dialogues de gestion chargés à leur première ouverture",
  },
  {
    date: "2026-09-26",
    category: "Correctif",
    area: "Monde",
    text: "Écrans étroits : en-tête des onglets d’un monde et chronologie sur le fond de la page.",
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
