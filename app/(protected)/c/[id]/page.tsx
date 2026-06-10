import ChatRoomView from "./view";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TABLE } from "@/lib/constants";
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
      "id, name, title, banner_url, icon_url, world_id, created_by, worlds(id, name)",
    )
    .eq("id", id)
    .single();

  if (chatErr || !chatroom) return notFound();

  // 2) 50 derniers messages (ordre croissant pour affichage direct)
  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select(
      "id, chat_id, content, author_id, created_at, persona:personas(id, user_id, name, avatar_url)",
    )
    .eq("chat_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initialMessages = (messages ?? []).slice().reverse(); // on remet en croissant

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

    for (const r of rows ?? []) {
      const mid = Number((r as any).message_id);
      const emoji = String((r as any).emoji);
      const uid = String((r as any).user_id);

      if (!byMessage.has(mid)) byMessage.set(mid, new Map());
      const emMap = byMessage.get(mid)!;

      const prev = emMap.get(emoji) ?? { count: 0, me: false };
      emMap.set(emoji, {
        count: prev.count + 1,
        me: prev.me || (!!user && uid === user.id),
      });
    }
  }

  const initialMessagesWithReactions = initialMessages.map((m) => {
    const emMap = byMessage.get(m.id);
    const reactions: ReactionSummary[] = emMap
      ? Array.from(emMap.entries())
          .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
          .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
      : [];
    return { ...m, reactions };
  });
  /* reactions */

  const userIds = Array.from(
    new Set(
      (initialMessages ?? [])
        .map((m) => {
          const p = m.persona as unknown as Persona[] | null;
          return (m.author_id ?? p?.[0]?.user_id) as string | null;
        })
        .filter(Boolean) as string[],
    ),
  );

  let equippedFrames: Record<string, string | null> = {};
  if (userIds.length) {
    const { data: equips } = await supabase
      .from(TABLE.USER_EQUIPPED_COSMETICS)
      .select("user_id, cosmetic_items:avatar_frame_id(asset_url)")
      .in("user_id", userIds);

    for (const row of equips ?? []) {
      const cosmetic = row.cosmetic_items as unknown as { asset_url?: string | null }[] | null;
      equippedFrames[row.user_id] = cosmetic?.[0]?.asset_url ?? null;
    }
  }

  // 3) Persona par défaut pour cet utilisateur dans cette chatroom (facultatif)
  let initialPersona: {
    id: string;
    user_id: string;
    name: string;
    avatar_url: string | null;
  } | null = null;
  let canEdit = false;
  if (user) {
    const { data: pref } = await supabase
      .from("chatroom_persona_prefs")
      .select("persona:personas(id, user_id, name, avatar_url)")
      .eq("chat_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    initialPersona = (pref?.persona as unknown as Persona | null) ?? null;

    canEdit = chatroom.created_by === user.id;
    if (!canEdit && chatroom.world_id) {
      const { data: membership } = await supabase
        .from("world_members")
        .select("role")
        .eq("world_id", chatroom.world_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership && ["owner", "admin"].includes(membership.role)) {
        canEdit = true;
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
        worlds: (chatroom.worlds as unknown as { id: string; name: string }[] | null)?.[0] ?? null,
      }}
      initialMessages={initialMessagesWithReactions as unknown as ChatMessageWithPersona[]}
      initialPersona={initialPersona}
      selfId={user?.id ?? null}
      canEdit={canEdit}
      equippedFrames={equippedFrames}
      initialChatrooms={initialRoomsSafe} // ✅ nouveau
    />
  );
}
