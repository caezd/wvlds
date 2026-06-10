// Auto-inferred from codebase — update when schema changes
// Once Docker is available: npx supabase gen types typescript --local > types/db.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ─── Core row types ─────────────────────────────────────────────────────────

export type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
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

export type ChatMessage = {
  id: number;
  chat_id: string;
  author_id: string;
  content: string;
  created_at: string;
  persona_id?: string | null;
  world_id?: string | null;
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
};

export type UserEquippedCosmetic = {
  user_id: string;
  avatar_frame_id: string | null;
};

// ─── Composite / query types ─────────────────────────────────────────────────

export type ReactionSummary = {
  emoji: string;
  count: number;
  me: boolean;
};

export type ChatMessageWithPersona = ChatMessage & {
  persona?: Persona | null;
  reactions?: ReactionSummary[];
};

// ─── RPC return types ────────────────────────────────────────────────────────

export type WorldUnreadRow = {
  world_id: string;
  unread_messages: number;
  unread_rooms: number;
};

export type ChatroomUnreadRow = {
  chat_id: string;
  unread_messages: number;
};
