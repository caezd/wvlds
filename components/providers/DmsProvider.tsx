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
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { TABLE, RPC, channel, DELAY } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
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

// Curseur de pagination attendu par get_dm_conversations(p_cursor, …) : le
// même calcul que sortByLastMessage() côté client, appliqué à la dernière
// ligne renvoyée par le serveur.
function lastConvCursor(rows: DmConversation[]): string | null {
  const last = rows[rows.length - 1];
  return last ? (last.last_message_at ?? last.created_at) : null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DM_MESSAGES_PAGE = 30;
const DM_CONVERSATIONS_PAGE = 20;
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
  hasMoreConversations: boolean;
  loadMoreConversations: () => Promise<void>;
  otherTyping: boolean;
  emitTyping: () => void;

  // Épingles
  pinnedConvIds: string[];
  pinConv: (convId: string) => void;
  unpinConv: (convId: string) => void;

  // Blocage
  blockedUserIds: string[];
  blockUser: (otherUserId: string) => Promise<void>;
  unblockUser: (otherUserId: string) => Promise<void>;

  // Actions
  openConversation: (otherUserId: string) => Promise<void>;
  closeConversation: () => void;
  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: number, content: string) => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
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
  hasMoreConversations: false,
  loadMoreConversations: async () => {},
  otherTyping: false,
  emitTyping: () => {},
  pinnedConvIds: [],
  pinConv: () => {},
  unpinConv: () => {},
  blockedUserIds: [],
  blockUser: async () => {},
  unblockUser: async () => {},
  openConversation: async () => {},
  closeConversation: () => {},
  sendMessage: async () => {},
  editMessage: async () => {},
  deleteMessage: async () => {},
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
  const reconnectEpoch = useReconnectEpoch();
  const { direct_messages: dmsEnabled } = useFeatureFlags();
  const t = useTranslations("dms");

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
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const convCursorRef = useRef<string | null>(null);
  const isLoadingMoreConvsRef = useRef(false);

  // ── Indicateur « en train d'écrire » (broadcast sur le canal de messages
  // de la conversation active — voir usePresenceChannel.ts pour l'équivalent
  // chatrooms) ─────────────────────────────────────────────────────────────
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  // Miroir synchronisé pendant le rendu : permet au handler du canal
  // « conversations » de savoir si une conversation existe déjà sans dépendre
  // d'une closure figée au montage de l'effet (voir plus bas).
  const conversationsRef = useRef<DmConversation[]>([]);
  conversationsRef.current = conversations;

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

  // ── Blocage ────────────────────────────────────────────────────────────────
  // Ne reflète que les blocages émis par l'utilisateur courant (RLS de
  // user_blocks : on ne peut pas voir qui nous a bloqué, par conception).

  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);

  const loadBlockedUsers = useCallback(async () => {
    const { data } = await supabase.from(TABLE.USER_BLOCKS).select("blocked_id");
    setBlockedUserIds(((data ?? []) as { blocked_id: string }[]).map(r => r.blocked_id));
  }, [supabase]);

  const blockUser = useCallback(async (otherUserId: string) => {
    const { error } = await supabase.rpc(RPC.BLOCK_USER, { p_blocked_id: otherUserId });
    if (error) {
      toast.error(t("blockError"));
      return;
    }
    setBlockedUserIds(prev => prev.includes(otherUserId) ? prev : [...prev, otherUserId]);
  }, [supabase, t]);

  const unblockUser = useCallback(async (otherUserId: string) => {
    const { error } = await supabase.rpc(RPC.UNBLOCK_USER, { p_blocked_id: otherUserId });
    if (error) {
      toast.error(t("unblockError"));
      return;
    }
    setBlockedUserIds(prev => prev.filter(id => id !== otherUserId));
  }, [supabase, t]);

  // ── Data actions ──────────────────────────────────────────────────────────

  // Recharge la 1re page (remet la pagination à zéro) : utilisé au refresh
  // après ouverture d'une conversation et quand une conversation inédite
  // apparaît via le canal realtime.
  const loadConversations = useCallback(async () => {
    const { data } = await supabase.rpc(RPC.GET_DM_CONVERSATIONS, { p_limit: DM_CONVERSATIONS_PAGE });
    if (!data) return;
    const rows = data as DmConversation[];
    setConversations(dedupeConversations(rows));
    setHasMoreConversations(rows.length >= DM_CONVERSATIONS_PAGE);
    convCursorRef.current = lastConvCursor(rows);
  }, [supabase]);

  const loadMoreConversations = useCallback(async () => {
    const cursor = convCursorRef.current;
    if (!cursor || isLoadingMoreConvsRef.current) return;
    isLoadingMoreConvsRef.current = true;

    const { data } = await supabase.rpc(RPC.GET_DM_CONVERSATIONS, {
      p_cursor: cursor,
      p_limit: DM_CONVERSATIONS_PAGE,
    });

    isLoadingMoreConvsRef.current = false;
    const older = (data ?? []) as DmConversation[];
    if (older.length === 0) {
      setHasMoreConversations(false);
      return;
    }
    setConversations(prev => dedupeConversations([...prev, ...older]));
    convCursorRef.current = lastConvCursor(older);
    if (older.length < DM_CONVERSATIONS_PAGE) setHasMoreConversations(false);
  }, [supabase]);

  const markConvRead = useCallback(async (convId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase.from(TABLE.DM_READS).upsert(
      { conversation_id: convId, user_id: uid, last_read_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" },
    );
    // Marquer « lu » à l'écran alors que le serveur l'ignore fait réapparaître
    // le compteur au rechargement, sans explication. On garde l'état réel.
    if (error) {
      console.error("[markConvRead]", error.message);
      return;
    }
    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c),
    );
  }, [supabase]);

  const openConversation = useCallback(async (otherUserId: string) => {
    if (!userIdRef.current) return;

    const { data: convId, error } = await supabase.rpc(RPC.FIND_OR_CREATE_DM, {
      p_other_user_id: otherUserId,
    });
    if (error || !convId) {
      toast.error(t("openError"));
      return;
    }

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

    // L'abonnement realtime aux messages de cette conv est géré par l'effet
    // ci-dessous, déclenché par le changement de activeConvId.
  }, [supabase, loadConversations, markConvRead, t]);

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
  }, []);

  // Abonnement realtime aux nouveaux messages de la conversation active.
  // Effet séparé (plutôt qu'inline dans openConversation) pour pouvoir se
  // recréer via reconnectEpoch après une coupure réseau, comme les autres
  // canaux Realtime de l'app.
  useEffect(() => {
    if (!activeConvId) return;
    setOtherTyping(false);

    const ch = supabase
      .channel(channel.dmMessages(activeConvId), { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: TABLE.DM_MESSAGES,
          filter: `conversation_id=eq.${activeConvId}`,
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
            setOtherTyping(false);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: TABLE.DM_MESSAGES,
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const msg = payload.new as DmMessage;
          setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: TABLE.DM_MESSAGES,
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload: { old: Record<string, unknown> }) => {
          const oldId = (payload.old as { id?: number }).id;
          setMessages(prev => prev.filter(m => m.id !== oldId));
        },
      )
      .on("broadcast", { event: "typing" }, () => {
        setOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), DELAY.TYPING_TIMEOUT);
      })
      .subscribe();
    msgChannelRef.current = ch;

    return () => {
      void supabase.removeChannel(ch);
      if (msgChannelRef.current === ch) msgChannelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setOtherTyping(false);
    };
  }, [activeConvId, supabase, markConvRead, reconnectEpoch]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < DELAY.TYPING_THROTTLE) return;
    lastTypingSentRef.current = now;
    void msgChannelRef.current?.send({ type: "broadcast", event: "typing", payload: {} });
  }, []);

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
      toast.error(t("sendError"));
      return;
    }

    if (data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data as DmMessage : m));
      // Champ dénormalisé : le message lui-même est enregistré, seul le tri
      // des conversations peut être décalé. On trace sans interrompre.
      const { error: bumpError } = await supabase
        .from(TABLE.DM_CONVERSATIONS)
        .update({ last_message_at: data.created_at })
        .eq("id", convId);
      if (bumpError) console.error("[sendDm] last_message_at non mis à jour", bumpError.message);
      setConversations(prev => applyNewMessage(prev, data as DmMessage));
    }
  }, [supabase, t]);

  // Édition/suppression d'un message : l'aperçu de la liste de conversations
  // se resynchronise tout seul via le canal « conversations » (déjà abonné
  // à UPDATE/DELETE sur dm_messages, voir plus haut) — pas besoin d'y toucher
  // ici.
  const editMessage = useCallback(async (messageId: number, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const { data, error } = await supabase
      .from(TABLE.DM_MESSAGES)
      .update({ content: trimmed })
      .eq("id", messageId)
      .select()
      .single();

    if (error || !data) {
      toast.error(t("editError"));
      return;
    }
    setMessages(prev => prev.map(m => m.id === messageId ? data as DmMessage : m));
  }, [supabase, t]);

  const deleteMessage = useCallback(async (messageId: number) => {
    const { error } = await supabase.from(TABLE.DM_MESSAGES).delete().eq("id", messageId);
    if (error) {
      toast.error(t("deleteError"));
      return;
    }
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, [supabase, t]);

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
    if (!userId || !dmsEnabled) return;

    // Bootstrap via get_app_shell() : partagée avec NotificationsProvider, qui
    // monte en parallèle dans une autre branche de l'arbre. Le second des deux
    // à appeler récupère la promesse déjà en vol au lieu de refaire la requête.
    let mounted = true;
    (async () => {
      const shell = await fetchAppShell(supabase, userId);
      if (!mounted) return;
      // get_app_shell() ne renvoie que la 1re page (voir migration 103) : au
      // delà, loadMoreConversations() prend le relais via get_dm_conversations.
      setConversations(dedupeConversations(shell.dm_conversations));
      setHasMoreConversations(shell.dm_conversations.length >= DM_CONVERSATIONS_PAGE);
      convCursorRef.current = lastConvCursor(shell.dm_conversations);
    })();
    void loadBlockedUsers();

    const convCh = supabase
      .channel(channel.dmConversations(userId))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE.DM_MESSAGES }, (payload: { new: Record<string, unknown> }) => {
        const msg = payload.new as DmMessage;

        // Conversation inédite (premier message reçu d'un nouvel
        // interlocuteur) : son profil n'est pas encore en mémoire, seul un
        // aller-retour serveur peut le récupérer.
        if (!conversationsRef.current.some(c => c.id === msg.conversation_id)) {
          void loadConversations();
          return;
        }

        // Conversation déjà connue : mise à jour locale seule (aperçu, tri,
        // non-lus), sans refaire tourner get_dm_conversations() — qui
        // recalcule 3 sous-requêtes par conversation pour un seul message reçu.
        const isMine = msg.author_id === userIdRef.current;
        const isActive = activeConvIdRef.current === msg.conversation_id;
        setConversations(prev => sortByLastMessage(prev.map(c => c.id === msg.conversation_id
          ? {
              ...c,
              last_message_at: msg.created_at,
              last_message_content: msg.content,
              last_message_author_id: msg.author_id,
              unread_count: isMine || isActive ? c.unread_count : c.unread_count + 1,
            }
          : c,
        )));
      })
      // Édition/suppression d'un message (pas d'UI aujourd'hui, mais possible
      // via modération ou correctif direct) : resynchronise l'aperçu et le tri.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLE.DM_MESSAGES }, () => {
        void loadConversations();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: TABLE.DM_MESSAGES }, () => {
        void loadConversations();
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(convCh);
    };
    // reconnectEpoch : force la recréation du canal après une coupure réseau
    // (voir useReconnectEpoch). Le canal de la conversation active a son
    // propre effet, plus bas.
  }, [userId, dmsEnabled, reconnectEpoch, loadBlockedUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Value ─────────────────────────────────────────────────────────────────

  const value = useMemo<Ctx>(() => ({
    panelOpen, openPanel, closePanel, togglePanel,
    currentUserId: userId,
    conversations, activeConvId, messages, commonWorldsCount, totalUnread, hasMoreMessages,
    hasMoreConversations, loadMoreConversations,
    otherTyping, emitTyping,
    pinnedConvIds, pinConv, unpinConv,
    blockedUserIds, blockUser, unblockUser,
    openConversation, closeConversation, sendMessage, editMessage, deleteMessage, markConvRead, loadMoreMessages,
  }), [
    panelOpen, openPanel, closePanel, togglePanel,
    userId,
    conversations, activeConvId, messages, commonWorldsCount, totalUnread, hasMoreMessages,
    hasMoreConversations, loadMoreConversations,
    otherTyping, emitTyping,
    pinnedConvIds, pinConv, unpinConv,
    blockedUserIds, blockUser, unblockUser,
    openConversation, closeConversation, sendMessage, editMessage, deleteMessage, markConvRead, loadMoreMessages,
  ]);

  return <DmsCtx.Provider value={value}>{children}</DmsCtx.Provider>;
}
