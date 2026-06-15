import ChatRoomView from "./view";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TABLE, CHAT_MESSAGES_PAGE_SIZE } from "@/lib/constants";
import { decryptMessage } from "@/lib/crypto";
import type { ChatMessageWithPersona, Persona } from "@/types/db";

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: chatroom, error: chatErr } = await supabase
    .from("chatrooms")
    .select(
      "id, name, title, banner_url, icon_url, world_id, created_by, worlds(id, name, owner_id, world_members(user_id))",
    )
    .eq("id", id)
    .single();

  if (chatErr || !chatroom) return notFound();

  // 2) Derniers messages (ordre croissant pour affichage direct) ; le reste est
  // chargé à la demande côté client quand on remonte dans l'historique
  const { data: messages } = await supabase
    .from("chat_messages")
    .select(
      "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url, frame:avatar_frame_id(asset_url))",
    )
    .eq("chat_id", id)
    .order("created_at", { ascending: false })
    .limit(CHAT_MESSAGES_PAGE_SIZE);

  const initialMessages = (messages ?? []).slice().reverse(); // on remet en croissant
  const initialHasMore = (messages ?? []).length === CHAT_MESSAGES_PAGE_SIZE;

  /* reactions */
  type ReactionSummary = { emoji: string; count: number; me: boolean };

  const messageIds = initialMessages.map((m) => m.id);
  const byMessage = new Map<
    number,
    Map<string, { count: number; me: boolean }>
  >();

  if (messageIds.length) {
    const { data: rows } = await supabase
      .from("chat_message_reactions")
      .select("message_id, emoji, user_id")
      .eq("chat_id", id)
      .in("message_id", messageIds);

    for (const r of (rows ?? []) as Array<{ message_id: number; emoji: string; user_id: string }>) {
      const mid = Number(r.message_id);
      const emoji = String(r.emoji);
      const uid = String(r.user_id);

      if (!byMessage.has(mid)) byMessage.set(mid, new Map());
      const emMap = byMessage.get(mid)!;

      const prev = emMap.get(emoji) ?? { count: 0, me: false };
      emMap.set(emoji, {
        count: prev.count + 1,
        me: prev.me || (!!user && uid === user.id),
      });
    }
  }

  // Clé de chiffrement du chatroom (null = chatroom sans clé, messages en clair)
  const { data: keyRow } = await supabase
    .from(TABLE.CHATROOM_KEYS)
    .select("key_b64")
    .eq("chatroom_id", id)
    .maybeSingle();
  const chatroomKey = (keyRow as unknown as { key_b64?: string } | null)?.key_b64 ?? null;

  const initialMessagesWithReactions = await Promise.all(
    initialMessages.map(async (m) => {
      const emMap = byMessage.get(m.id);
      const reactions: ReactionSummary[] = emMap
        ? Array.from(emMap.entries())
            .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
            .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
        : [];
      const content = chatroomKey
        ? await decryptMessage((m as { content?: string }).content ?? "", chatroomKey)
        : ((m as { content?: string }).content ?? "");
      return { ...m, content, reactions };
    }),
  );
  /* reactions */

  // Données du monde associé (extracted pour usage multiple)
  const rawWorld = chatroom.worlds as unknown;
  const worldData = (Array.isArray(rawWorld) ? rawWorld[0] : rawWorld) as { id: string; name: string; owner_id?: string; world_members?: { user_id: string }[] } | null | undefined;

  // 3) Persona par défaut pour cet utilisateur dans cette chatroom (facultatif)
  let initialPersona: {
    id: string;
    user_id: string;
    name: string;
    avatar_url: string | null;
  } | null = null;
  let canEdit = false;
  let canWorldAdmin = false;
  if (user) {
    const { data: pref } = await supabase
      .from("chatroom_persona_prefs")
      .select("persona:personas(id, user_id, name, avatar_url)")
      .eq("chat_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    initialPersona = (pref?.persona as unknown as Persona | null) ?? null;

    canEdit = chatroom.created_by === user.id;
    if (chatroom.world_id) {
      if (worldData?.owner_id && user.id === worldData.owner_id) {
        canWorldAdmin = true;
        canEdit = true;
      } else {
        const { data: membership } = await supabase
          .from("world_members")
          .select("role")
          .eq("world_id", chatroom.world_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (membership && ["owner", "admin"].includes(membership.role)) {
          canWorldAdmin = true;
          canEdit = true;
        }
      }
    }
  }

  // 4) Chatrooms du même world (pour l'aside)
  let initialRoomsSafe: { id: string; title: string | null; name: string | null; icon_url: string | null; last_message_at: string | null; unread_count: number }[] = [];

  if (chatroom.world_id) {
    const { data: navRooms, error: navErr } = await supabase.rpc("list_chatrooms_nav", {
      p_world_id: chatroom.world_id,
    });

    if (!navErr && navRooms) {
      initialRoomsSafe = navRooms as typeof initialRoomsSafe;
    } else {
      // Fallback : requête directe si le RPC n'existe pas encore
      const { data: fallback } = await supabase
        .from(TABLE.CHATROOMS)
        .select("id, title, name, icon_url, updated_at")
        .eq("world_id", chatroom.world_id)
        .order("updated_at", { ascending: false });

      initialRoomsSafe = (fallback ?? []).map((r) => ({
        id: r.id,
        title: r.title ?? null,
        name: r.name ?? null,
        icon_url: r.icon_url ?? null,
        last_message_at: r.updated_at ?? null,
        unread_count: 0,
      }));
    }
  }

  return (
    <ChatRoomView
      chatId={id}
      initialChat={{
        id: chatroom.id,
        title: chatroom.title ?? "Nouvelle salle",
        banner_url: chatroom.banner_url ?? null,
        icon_url: chatroom.icon_url ?? null,
        worlds: (() => {
        const w = worldData;
        if (!w?.id) return null;
        const isShared = (w.world_members ?? []).some((m: { user_id: string }) => m.user_id !== w.owner_id);
        return { id: w.id, name: w.name, isShared, owner_id: w.owner_id ?? null };
      })(),
      }}
      initialMessages={initialMessagesWithReactions as unknown as ChatMessageWithPersona[]}
      initialHasMore={initialHasMore}
      initialPersona={initialPersona}
      selfId={user?.id ?? null}
      canEdit={canEdit}
      canWorldAdmin={canWorldAdmin}
      initialChatrooms={initialRoomsSafe}
      chatroomKey={chatroomKey}
    />
  );
}
