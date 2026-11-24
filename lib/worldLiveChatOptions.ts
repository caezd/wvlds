/**
 * Les options de la chatbox d'un monde (migration 241), toutes éteintes par
 * défaut. La base fait foi à l'envoi (tg_world_live_message_options) ;
 * l'affichage les suit aussi : une option éteinte après coup ne colore plus
 * les messages et ne montre plus leur persona.
 */
export const LIVE_CHAT_OPTION_FIELDS = [
  "live_chat_colors",
  "live_chat_bubbles",
  "live_chat_personas",
  "live_chat_actions",
] as const;

export type LiveChatOptionField = (typeof LIVE_CHAT_OPTION_FIELDS)[number];

export type LiveChatOptions = {
  /** Chaque joueur choisit une couleur de dialogue. */
  colors: boolean;
  /** Messages en bulles, les siens à droite. */
  bubbles: boolean;
  /** Un message peut être signé « joueur avec persona ». */
  personas: boolean;
  /** `/me …` écrit une action jouée. */
  actions: boolean;
};

export const NO_LIVE_CHAT_OPTIONS: LiveChatOptions = { colors: false, bubbles: false, personas: false, actions: false };

type OptionRow = Partial<Record<LiveChatOptionField, boolean | null>>;

/** Les options d'une ligne `worlds` : seul `true` allume (défaut en base : false). */
export function liveChatOptionsOf(row: OptionRow | null | undefined): LiveChatOptions {
  return {
    colors: row?.live_chat_colors === true,
    bubbles: row?.live_chat_bubbles === true,
    personas: row?.live_chat_personas === true,
    actions: row?.live_chat_actions === true,
  };
}

/** Le préfixe d'une action jouée : `/me ` en tête du message. */
const ACTION_PREFIX = /^\/me\s+/i;

/**
 * Lit un message tapé : `/me se lève` devient l'action « se lève » quand le
 * monde les permet ; sinon le texte part tel quel.
 */
export function parseLiveChatInput(raw: string, actionsAllowed: boolean): { content: string; isAction: boolean } {
  const content = raw.trim();
  if (actionsAllowed && ACTION_PREFIX.test(content)) {
    const rest = content.replace(ACTION_PREFIX, "").trim();
    if (rest) return { content: rest, isAction: true };
  }
  return { content, isAction: false };
}
