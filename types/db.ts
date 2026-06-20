// Auto-inferred from codebase — update when schema changes
// Once Docker is available: npx supabase gen types typescript --local > types/db.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// --- Core row types ---------------------------------------------------------

export type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  last_seen_at?: string | null;
  appear_offline?: boolean;
};

export type World = {
  id: string;
  name: string;
};

export type WorldMember = {
  world_id: string;
  user_id: string;
};

export type WorldMemberRead = {
  world_id: string;
  user_id: string;
  last_seen_at: string;
};

export type Chatroom = {
  id: string;
  title: string | null;
  name: string | null;
  banner_url: string | null;
  icon_url: string | null;
  world_id: string | null;
  created_by: string | null;
  updated_at: string | null;
};

export type ChatroomRead = {
  chat_id: string;
  user_id: string;
  last_read_at: string;
};

export type ChatroomPersonaPref = {
  chat_id: string;
  user_id: string;
  persona_id: string;
  updated_at: string;
};

export type ChatMediaItem = {
  url: string;
  name: string;
};

export type ChatMessageMeta = {
  bubbles?: boolean;
  bubbleColor?: string;
  media?: ChatMediaItem[];
  word_count?: number;
  visible_to_labels?: string[];
};

export type ChatMessage = {
  id: number;
  chat_id: string;
  author_id: string;
  content: string;
  created_at: string;
  persona_id?: string | null;
  world_id?: string | null;
  metadata?: ChatMessageMeta | null;
  visible_to?: string[] | null;
};

export type ChatMessageReaction = {
  id: number;
  message_id: number;
  chat_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type Persona = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  avatar_frame_id?: string | null;
  frame?: { asset_url: string | null } | null;
};

export type UserEquippedCosmetic = {
  user_id: string;
  avatar_frame_id: string | null;
};

// --- Composite / query types -------------------------------------------------

export type ReactionSummary = {
  emoji: string;
  count: number;
  me: boolean;
};

export type ChatMessageWithPersona = ChatMessage & {
  persona?: Persona | null;
  reactions?: ReactionSummary[];
};

// --- RPC return types --------------------------------------------------------

export type WorldUnreadRow = {
  world_id: string;
  unread_messages: number;
  unread_rooms: number;
};

export type ChatroomUnreadRow = {
  chat_id: string;
  unread_messages: number;
};

// --- Notifications -----------------------------------------------------------

export type NotificationType = 'mention' | 'reaction' | 'new_member' | 'new_chatroom' | 'world_invite' | 'chatroom_reply';

export type WorldInvitation = {
  id: string;
  world_id: string;
  invitee_id: string;
  inviter_id: string | null;
  role: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

export type NotificationMeta = {
  icon_url?: string | null;
  banner_url?: string | null;
  description?: string | null;
  count?: number;
};

export type AppNotification = {
  id: string;
  recipient_id: string;
  type: NotificationType;
  world_id: string | null;
  chat_id: string | null;
  message_id: number | null;
  actor_id: string | null;
  actor_name: string | null;
  content: string | null;
  metadata?: NotificationMeta | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreference = {
  user_id: string;
  type: NotificationType;
  enabled: boolean;
};
