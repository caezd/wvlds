export type SearchTokenType = "author" | "channel" | "mentions" | "contains";

export type SearchToken = {
  /** Clé React stable (type + valeur) */
  id: string;
  type: SearchTokenType;
  /** Libellé affiché dans la puce (ex: "kael") */
  label: string;
  /** id sous-jacent (persona/profil/salon) ou "media"/"link" pour `contains` */
  value: string;
  /** Pour author/mentions : d'où vient la valeur (filtre différent selon le cas) */
  kind?: "profile" | "persona";
  /** Pour mentions : pseudo réel à chercher dans le texte (@pseudo) */
  mentionUsername?: string;
};
