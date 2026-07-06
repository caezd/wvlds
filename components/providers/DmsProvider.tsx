"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE, RPC, channel } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { DmConversation, DmMessage } from "@/types/db";
import { fetchAppShell } from "@/lib/appShell";

// Déduplication défensive : `get_dm_conversations()` trie par date desc, on
// garde la 1re occurrence par other_user_id.
function dedupeConversations(rows: DmConversation[]): DmConversation[] {
  const seen = new Set<string>();
  return rows.filter(c => {
    if (seen.has(c.other_user_id)) return false;
    seen.add(c.other_user_id);
    return true;
  });
}

function sortByLastMessage(convs: DmConversation[]): DmConversation[] {
  return [...convs].sort((a, b) =>
    new Date(b.last_message_at ?? b.created_at).getTime() -
    new Date(a.last_message_at ?? a.created_at).getTime()
  );
}

function applyNewMessage(convs: DmConversation[], msg: DmMessage): DmConversation[] {
  return sortByLastMessage(
    convs.map(c => c.id === msg.conversation_id
      ? { ...c, last_message_at: msg.created_at, last_message_content: msg.content, last_message_author_id: msg.author_id }
      : c
    )
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DM_MESSAGES_PAGE = 30;
const PINNED_KEY = "wvlds:dm_pinned";
const MAX_PINNED = 3;
const lastConvKey = (uid: string) => `wvlds:dm_last:${uid}`;

// ── Context type ──────────────────────────────────────────────────────────────

type Ctx = {
  // Panel open/close
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  // Conversations
  currentUserId: string | null;
  conversations: DmConversation[];
  activeConvId: string | null;
  messages: DmMessage[];
  commonWorldsCount: number | null;
  totalUnread: number;
  hasMoreMessages: boolean;

  // Épingles
  pinnedConvIds: string[];
  pinConv: (convId: string) => void;
  unpinConv: (convId: string) => void;

  // Actions
  openConversation: (otherUserId: string) => Promise<void>;
  closeConversation: () => void;
  sendMessage: (content: string) => Promise<void>;
  markConvRead: (convId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
};

const DmsCtx = createContext<Ctx | null>(null);

const DEFAULT_CTX: Ctx = {
  panelOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  togglePanel: () => {},
  currentUserId: null,
  conversations: [],
  activeConvId: null,
  messages: [],
  commonWorldsCount: null,
  totalUnread: 0,
  hasMoreMessages: false,
  pinnedConvIds: [],
  pinConv: () => {},
  unpinConv: () => {},
  openConversation: async () => {},
  closeConversation: () => {},
  sendMessage: async () => {},
  markConvRead: async () => {},
  loadMoreMessages: async () => {},
};

export function useDms() {
  return useContext(DmsCtx) ?? DEFAULT_CTX;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export default function DmsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  // Miroir synchronisé pendant le rendu (pas dans un effet) : évite la
  // fenêtre où un handler lirait une ref en retard d'un rendu.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  // ── Panel state ───────────────────────────────────────────────────────────

  const [panelOpen, setPanelOpen] = useState(false);
  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => setPanelOpen(v => !v), []);

  // ── Conversations & messages ──────────────────────────────────────────────

  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [commonWorldsCount, setCommonWorldsCount] = useState<number | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  const activeConvIdRef = useRef<string | null>(null);
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const msgCursorRef = useRef<string | null>(null);
  const isLoadingMoreMsgsRef = useRef(false);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
    [conversations],
  );

  // ── Épingles (localStorage) ───────────────────────────────────────────────

  const [pinnedConvIds, setPinnedConvIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch { return []; }
  });

  const pinConv = useCallback((convId: string) => {
    setPinnedConvIds(prev => {
      if (prev.includes(convId)) return prev;
      const next = [convId, ...prev].slice(0, MAX_PINNED);
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const unpinConv = useCallback((convId: string) => {
    setPinnedConvIds(prev => {
      const next = prev.filter(id => id !== convId);
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Data actions ──────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    const { data } = await supabase.rpc(RPC.GET_DM_CONVERSATIONS);
    if (!data) return;
    setConversations(dedupeConversations(data as DmConversation[]));
  }, [supabase]);

  const markConvRead = useCallback(async (convId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    await supabase.from(TABLE.DM_READS).upsert(
      { conversation_id: convId, user_id: uid, last_read_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" },
    );
    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c),
    );
  }, [supabase]);

  const openConversation = useCallback(async (otherUserId: string) => {
    if (!userIdRef.current) return;

    const { data: convId } = await supabase.rpc(RPC.FIND_OR_CREATE_DM, {
      p_other_user_id: otherUserId,
    });
    if (!convId) return;

    const [{ data: msgsDesc }, { data: count }] = await Promise.all([
      supabase
        .from(TABLE.DM_MESSAGES)
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(DM_MESSAGES_PAGE),
      supabase.rpc(RPC.COUNT_COMMON_WORLDS, { p_other_user_id: otherUserId }),
    ]);

    // Ordre desc pour récupérer les N derniers, puis on inverse pour afficher en asc
    const ordered = ((msgsDesc ?? []) as DmMessage[]).reverse();
    setMessages(ordered);
    setHasMoreMessages((msgsDesc?.length ?? 0) >= DM_MESSAGES_PAGE);
    msgCursorRef.current = ordered[0]?.created_at ?? null;
    isLoadingMoreMsgsRef.current = false;

    setActiveConvId(convId as string);
    activeConvIdRef.current = convId as string;
    setCommonWorldsCount(typeof count === "number" ? count : Number(count ?? 0));

    await markConvRead(convId as string);
    void loadConversations();

    // Persiste la dernière conversation ouverte
    if (userIdRef.current) {
      localStorage.setItem(lastConvKey(userIdRef.current), otherUserId);
    }

    // Ouvre le panel automatiquement
    setPanelOpen(true);

    // Abonnement realtime aux nouveaux messages de cette conv
    if (msgChannelRef.current) {
      await supabase.removeChannel(msgChannelRef.current);
    }
    const ch = supabase
      .channel(channel.dmMessages(convId as string))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: TABLE.DM_MESSAGES,
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const msg = payload.new as DmMessage;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          setConversations(prev => applyNewMessage(prev, msg));
          if (
            activeConvIdRef.current === msg.conversation_id &&
            msg.author_id !== userIdRef.current
          ) {
            void markConvRead(msg.conversation_id);
          }
        },
      )
      .subscribe();
    msgChannelRef.current = ch;
  }, [supabase, loadConversations, markConvRead]);

  const loadMoreMessages = useCallback(async () => {
    const convId = activeConvIdRef.current;
    const cursor = msgCursorRef.current;
    if (!convId || !cursor || isLoadingMoreMsgsRef.current) return;
    isLoadingMoreMsgsRef.current = true;

    const { data } = await supabase
      .from(TABLE.DM_MESSAGES)
      .select("*")
      .eq("conversation_id", convId)
      .lt("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(DM_MESSAGES_PAGE);

    isLoadingMoreMsgsRef.current = false;
    if (!data || data.length === 0) {
      setHasMoreMessages(false);
      return;
    }
    const older = (data as DmMessage[]).reverse();
    setMessages(prev => [...older, ...prev]);
    msgCursorRef.current = older[0]?.created_at ?? cursor;
    if (data.length < DM_MESSAGES_PAGE) setHasMoreMessages(false);
  }, [supabase]);

  const closeConversation = useCallback(() => {
    setActiveConvId(null);
    activeConvIdRef.current = null;
    setMessages([]);
    setCommonWorldsCount(null);
    setHasMoreMessages(false);
    msgCursorRef.current = null;
    isLoadingMoreMsgsRef.current = false;
    if (msgChannelRef.current) {
      void supabase.removeChannel(msgChannelRef.current);
      msgChannelRef.current = null;
    }
  }, [supabase]);

  const sendMessage = useCallback(async (content: string) => {
    const uid = userIdRef.current;
    const convId = activeConvIdRef.current;
    if (!uid || !convId || !content.trim()) return;

    const optimistic: DmMessage = {
      id: Date.now(),
      conversation_id: convId,
      author_id: uid,
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    const { data, error } = await supabase
      .from(TABLE.DM_MESSAGES)
      .insert({ conversation_id: convId, author_id: uid, content: content.trim() })
      .select()
      .single();

    if (error || !data) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      return;
    }

    if (data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data as DmMessage : m));
      await supabase
        .from(TABLE.DM_CONVERSATIONS)
        .update({ last_message_at: data.created_at })
        .eq("id", convId);
      setConversations(prev => applyNewMessage(prev, data as DmMessage));
    }
  }, [supabase]);

  // ── Restauration de la dernière conversation ─────────────────────────────
  // Quand le panel s'ouvre sans conversation active, on rouvre la dernière.
  // Utilise un ref pour éviter une stale closure sur openConversation
  // (miroir synchronisé pendant le rendu, pas dans un effet).
  const openConversationRef = useRef(openConversation);
  openConversationRef.current = openConversation;

  useEffect(() => {
    if (!panelOpen || !userId || activeConvIdRef.current) return;
    const lastUserId = localStorage.getItem(lastConvKey(userId));
    if (lastUserId) void openConversationRef.current(lastUserId);
  }, [panelOpen, userId]);

  // ── Bootstrap + realtime ──────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;

    // Bootstrap via get_app_shell() : partagée avec NotificationsProvider, qui
    // monte en parallèle dans une autre branche de l'arbre. Le second des deux
    // à appeler récupère la promesse déjà en vol au lieu de refaire la requête.
    let mounted = true;
    (async () => {
      const shell = await fetchAppShell(supabase, userId);
      if (!mounted) return;
      setConversations(dedupeConversations(shell.dm_conversations));
    })();

    const convCh = supabase
      .channel(channel.dmConversations(userId))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE.DM_MESSAGES }, (payload: { new: Record<string, unknown> }) => {
        const msg = payload.new as DmMessage;
        setConversations(prev => applyNewMessage(prev, msg));
        void loadConversations();
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(convCh);
      if (msgChannelRef.current) {
        void supabase.removeChannel(msgChannelRef.current);
        msgChannelRef.current = null;
      }
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Value ─────────────────────────────────────────────────────────────────

  const value = useMemo<Ctx>(() => ({
    panelOpen, openPanel, closePanel, togglePanel,
    currentUserId: userId,
    conversations, activeConvId, messages, commonWorldsCount, totalUnread, hasMoreMessages,
    pinnedConvIds, pinConv, unpinConv,
    openConversation, closeConversation, sendMessage, markConvRead, loadMoreMessages,
  }), [
    panelOpen, openPanel, closePanel, togglePanel,
    userId,
    conversations, activeConvId, messages, commonWorldsCount, totalUnread, hasMoreMessages,
    pinnedConvIds, pinConv, unpinConv,
    openConversation, closeConversation, sendMessage, markConvRead, loadMoreMessages,
  ]);

  return <DmsCtx.Provider value={value}>{children}</DmsCtx.Provider>;
}
