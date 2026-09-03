// Formes de données propres à la carte d'un monde.

/**
 * Placement du panneau flottant d'un point, en pixels du viewport.
 *
 * `placement` dit de quel côté de l'épingle le panneau s'est posé, et
 * `arrowLeft` où planter la flèche DANS le panneau : près d'un bord de l'écran,
 * le panneau glisse pour rester visible alors que l'épingle, elle, ne bouge pas.
 */
export type PinPopoverPos = {
  left: number;
  top: number;
  placement: "above" | "below";
  /** Abscisse de la flèche, relative au bord gauche du panneau. */
  arrowLeft: number;
};

/** Point en cours de création : posé sur l'image, pas encore enregistré. */
export type PendingPin = {
  x: number; // pourcentage relatif à l'image
  y: number;
  title: string;
};

/**
 * Page du wiki proposée au lien d'une épingle.
 *
 * La liste est chargée une seule fois par `WorldMap` puis passée aux panneaux :
 * chaque panneau la rechargeait pour lui-même, soit une requête par ouverture
 * d'épingle pour un résultat identique.
 */
export type WikiPageOption = { id: string; title: string; slug: string };
