// --- Supabase table names -----------------------------------------------------
export const TABLE = {
  CHAT_MESSAGES: "chat_messages",
  CHAT_MESSAGE_REACTIONS: "chat_message_reactions",
  CHATROOMS: "chatrooms",
  CHATROOM_KEYS: "chatroom_keys",
  CHATROOM_READS: "chatroom_reads",
  CHATROOM_PERSONA_PREFS: "chatroom_persona_prefs",
  PERSONAS: "personas",
  PROFILES: "profiles",
  WORLDS: "worlds",
  WORLD_MEMBERS: "world_members",
  WORLD_MEMBER_READS: "world_member_reads",
  USER_EQUIPPED_COSMETICS: "user_equipped_cosmetics",
  USER_OWNED_COSMETICS: "user_owned_cosmetics",
  COSMETIC_ITEMS: "cosmetic_items",
  NOTIFICATIONS: "notifications",
  NOTIFICATION_PREFERENCES: "notification_preferences",
  WORLD_INVITATIONS: "world_invitations",
  CHAT_PINS: "chat_pins",
} as const;

// --- Supabase RPC names -------------------------------------------------------
export const RPC = {
  GET_WORLD_UNREADS: "get_world_unreads",
  GET_CHATROOM_UNREADS: "get_chatroom_unreads",
  AWARD_EVENT: "award_event",
  GET_BALANCE_SUMMARY: "get_balance_summary",
  ACCEPT_WORLD_INVITATION: "accept_world_invitation",
} as const;

// --- Realtime channel name factories -----------------------------------------
export const channel = {
  worldMessages: (wid: string) => `w:${wid}:messages`,
  worldRooms: (wid: string) => `w:${wid}:rooms`,
  chatPresence: (chatId: string) => `chat:${chatId}`,
  chatMessages: (chatId: string) => `chat-${chatId}`,
  chatMessageUpdates: (chatId: string) => `chat-messages-updates-${chatId}`,
  chatReactions: (chatId: string) => `chat-reactions-${chatId}`,
  chatPins: (chatId: string) => `chat-pins-${chatId}`,
  chatroomUpdates: (chatId: string) => `chatroom-updates-${chatId}`,
  navMessages: (worldId: string) => `nav-messages-${worldId}`,
  navReads: (selfId: string) => `nav-reads-${selfId}`,
  appPresence: () => "presence:app",
  userNotifs: (userId: string) => `notifs:${userId}`,
} as const;

// --- Throttle / debounce delays (ms) -----------------------------------------
export const DELAY = {
  MARK_READ_THROTTLE: 800,
  TYPING_THROTTLE: 1500,
  TYPING_TIMEOUT: 4000,
  NOTIFICATIONS_DEBOUNCE: 400,
} as const;

// --- Présence globale (indicateur "en ligne") ----------------------------------
export const PRESENCE = {
  // Inactif depuis moins de 5 min → "en ligne" (puce verte)
  AWAY_WINDOW_MS: 5 * 60_000,
  // Inactif entre 5 et 10 min → "absent" (puce orange)
  OFFLINE_WINDOW_MS: 10 * 60_000,
  // Fréquence max de mise à jour de last_active_at sur le canal de présence
  HEARTBEAT_MS: 60_000,
  // Fréquence de recalcul local de la liste des utilisateurs en ligne
  REFRESH_MS: 30_000,
} as const;

// --- UI thresholds ------------------------------------------------------------
export const SCROLL_THRESHOLD_PX = 96;

// --- Pagination ----------------------------------------------------------------
export const CHAT_MESSAGES_PAGE_SIZE = 20;
// Distance au haut du scroll (px) qui déclenche le chargement des messages plus anciens
export const LOAD_OLDER_THRESHOLD_PX = 200;
