/**
 * Délestage de la chatbox : combien de messages chaque salle garde
 * (`worlds.live_chat_retention`, migrations 239 et 240). Au-delà, les plus
 * anciens sont effacés à l'envoi d'un nouveau message, et tout de suite quand
 * le réglage baisse. Tout ce qui est gardé se consulte en remontant le fil :
 * c'est aussi le plus que la chatbox puisse charger.
 *
 * La base accepte de 25 à 100 ; l'interface propose ces paliers.
 */
export const LIVE_CHAT_RETENTION_PRESETS = [25, 50, 100] as const;

export type LiveChatRetention = (typeof LIVE_CHAT_RETENTION_PRESETS)[number];

/** Plafond par salle, pour tous les mondes ; c'est aussi le défaut en base. */
export const LIVE_CHAT_RETENTION_MAX: LiveChatRetention = 100;
export const DEFAULT_LIVE_CHAT_RETENTION: LiveChatRetention = LIVE_CHAT_RETENTION_MAX;

export function isLiveChatRetention(value: unknown): value is LiveChatRetention {
  return (LIVE_CHAT_RETENTION_PRESETS as readonly unknown[]).includes(value);
}

/**
 * Le palier à afficher pour une valeur lue en base : absente (monde chargé
 * sans la colonne) → défaut ; hors paliers → le palier le plus proche par en
 * dessous, jamais au-dessus de ce que la base garde.
 */
export function resolveLiveChatRetention(value: number | null | undefined): LiveChatRetention {
  if (value == null) return DEFAULT_LIVE_CHAT_RETENTION;
  if (isLiveChatRetention(value)) return value;
  let best: LiveChatRetention = LIVE_CHAT_RETENTION_PRESETS[0];
  for (const p of LIVE_CHAT_RETENTION_PRESETS) if (p <= value) best = p;
  return best;
}
