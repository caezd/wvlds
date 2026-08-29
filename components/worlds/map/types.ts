// Formes de données propres à la carte d'un monde.

/** Position d'ancrage du panneau flottant d'un point, en pixels du viewport. */
export type PinPopoverPos = { left: number; top: number };

/** Point en cours de création : posé sur l'image, pas encore enregistré. */
export type PendingPin = {
  x: number; // pourcentage relatif à l'image
  y: number;
  title: string;
};
