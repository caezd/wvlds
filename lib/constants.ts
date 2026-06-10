// ─── Supabase table names ─────────────────────────────────────────────────────
export const TABLE = {
  CHAT_MESSAGES: "chat_messages",
  CHAT_MESSAGE_REACTIONS: "chat_message_reactions",
  CHATROOMS: "chatrooms",
  CHATROOM_READS: "chatroom_reads",
  CHATROOM_PERSONA_PREFS: "chatroom_persona_prefs",
  PERSONAS: "personas",
  PROFILES: "profiles",
  WORLDS: "worlds",
  WORLD_MEMBERS: "world_members",
  WORLD_MEMBER_READS: "world_member_reads",
  USER_EQUIPPED_COSMETICS: "user_equipped_cosmetics",
} as const;

// ─── Supabase RPC names ───────────────────────────────────────────────────────
export const RPC = {
  GET_WORLD_UNREADS: "get_world_unreads",
  GET_CHATROOM_UNREADS: "get_chatroom_unreads",
  AWARD_EVENT: "award_event",
  GET_BALANCE_SUMMARY: "get_balance_summary",
} as const;

// ─── Realtime channel name factories ─────────────────────────────────────────
export const channel = {
  worldMessages: (wid: string) => `w:${wid}:messages`,
  worldRooms: (wid: string) => `w:${wid}:rooms`,
  chatPresence: (chatId: string) => `chat:${chatId}`,
  chatMessages: (chatId: string) => `chat-${chatId}`,
  chatMessageUpdates: (chatId: string) => `chat-messages-updates-${chatId}`,
  chatReactions: (chatId: string) => `chat-reactions-${chatId}`,
  chatroomUpdates: (chatId: string) => `chatroom-updates-${chatId}`,
  navMessages: (worldId: string) => `nav-messages-${worldId}`,
  navReads: (selfId: string) => `nav-reads-${selfId}`,
} as const;

// ─── Throttle / debounce delays (ms) ─────────────────────────────────────────
export const DELAY = {
  MARK_READ_THROTTLE: 800,
  TYPING_THROTTLE: 1500,
  TYPING_TIMEOUT: 4000,
  NOTIFICATIONS_DEBOUNCE: 400,
} as const;

// ─── UI thresholds ────────────────────────────────────────────────────────────
export const SCROLL_THRESHOLD_PX = 96;
