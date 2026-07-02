export type ChangelogEntry = {
  date: string; // "2026-06"
  tag: string;
  text: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  // ── 2026-07 ──────────────────────────────────────────────────────────────
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
    text: "Profil joueur personnalisable :\n- **Bio** (500 caractères max) et **pronoms** (jusqu'à 3, choisis dans une liste prédéfinie ou saisis librement) éditables depuis **Paramètres**\n- Nouvelle **carte profil** au clic sur l'avatar joueur dans un message de chatroom : pseudo, statut de présence, pronoms, bio et date d'inscription\n- Distincte du profil de persona existant (fiche de personnage) — ici il s'agit du compte joueur lui-même",
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
    tag: "i18n",
    text: "Traduction de l'interface :\n- Support de **3 langues** : Français, English, Español\n- Détection automatique via la langue du navigateur (`Accept-Language`)\n- Préférence sauvegardée dans le profil (synchronisation entre appareils)\n- Sélecteur de langue dans **Paramètres** (`/settings`)\n- Nouveau lien « Paramètres » dans le menu utilisateur\n- Page admin `/admin/translations` : tableau de couverture par namespace, alerte sur les clés manquantes\n- Architecture `next-intl` sans routing — les URLs restent inchangées",
  },
  {
    date: "2026-06",
    tag: "Social",
    text: "Catalogue des mondes publics :\n- Nouvelle page `/explore` : grille paginée (16 par page) de tous les mondes dont la visibilité est **publique**\n- **Recherche** par nom et description avec debounce 300 ms\n- Bouton **Rejoindre** directement depuis la carte (role `player` attribué automatiquement) ; bouton **Entrer** si déjà membre\n- Icône Boussole dans le rail de navigation (visible uniquement si le flag `public_worlds` est actif)\n- Les owners peuvent basculer leur monde en public/privé depuis les paramètres du monde (section Visibilité)\n- Activable via le flag admin `public_worlds`",
  },
  {
    date: "2026-06",
    tag: "Jeu",
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
